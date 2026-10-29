#!/usr/bin/env bash
# The official Certbot container never receives the Docker socket or application secrets.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Ejecutar con sudo en edge-vpn' >&2; exit 1; }
exec 9>/run/aeroquetzal-public-tls.lock
flock -n 9 || { echo 'Ya hay una renovación en curso' >&2; exit 1; }
mode="${1:-renew}"
[[ "$mode" == renew || "$mode" == install ]] || { echo 'Uso: renew-public-tls.sh [renew|install]' >&2; exit 1; }
release_dir="${RELEASE_DIR:-/opt/aeroquetzal-web}"
public_ip="${PUBLIC_IP:-178.104.151.184}"
state=/etc/aeroquetzal-web/letsencrypt
source_dir="$state/live/aeroquetzal-public-ip"
target="$release_dir/deploy/secrets/public-tls"
if [[ "$mode" == renew ]]; then
  docker run --rm --network host \
    -v "$state:/etc/letsencrypt" \
    -v /var/lib/aeroquetzal-web/certbot:/var/lib/letsencrypt \
    -v /var/log/aeroquetzal-web/certbot:/var/log/letsencrypt \
    -v aeroquetzal-public_acme:/var/www/acme \
    certbot/certbot:v5.9.0 renew --cert-name aeroquetzal-public-ip --non-interactive --quiet --no-random-sleep-on-renew
fi
reload_nginx() {
  if [[ "$(docker inspect -f '{{.State.Running}}' aq-public-web 2>/dev/null || true)" == true ]]; then
    docker exec aq-public-web nginx -t
    docker exec aq-public-web nginx -s reload
  fi
}
# Reject expired, staging, wrong-host or mismatched certificates before replacing files.
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt -untrusted "$source_dir/chain.pem" \
  -verify_ip "$public_ip" "$source_dir/cert.pem"
openssl x509 -in "$source_dir/cert.pem" -noout -checkend 86400
cmp <(openssl x509 -in "$source_dir/cert.pem" -pubkey -noout | openssl pkey -pubin -outform DER) \
    <(openssl pkey -in "$source_dir/privkey.pem" -pubout -outform DER)
install -d -m 0700 "$target"
if cmp -s "$source_dir/fullchain.pem" "$target/fullchain.pem" && \
   cmp -s "$source_dir/privkey.pem" "$target/privkey.pem"; then
  # Retry loading the installed files even if a previous reload failed.
  reload_nginx
  echo 'El certificado instalado está vigente y actualizado.'
  exit 0
fi
install -m 0644 "$source_dir/fullchain.pem" "$target/fullchain.pem.next"
install -m 0600 "$source_dir/privkey.pem" "$target/privkey.pem.next"
mv "$target/fullchain.pem.next" "$target/fullchain.pem"
mv "$target/privkey.pem.next" "$target/privkey.pem"
reload_nginx
echo 'Certificado público validado e instalado.'
