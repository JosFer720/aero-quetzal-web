#!/usr/bin/env bash
set -euo pipefail
exec 9>/run/aeroquetzal-domain-tls.lock
flock -n 9 || exit 0
state=/etc/aeroquetzal-web/letsencrypt
source_dir="$state/live/aeroquetzal-public-domain"
target=/opt/aeroquetzal-web/deploy/secrets/public-domain-tls
if [[ "${1:-renew}" != install ]]; then
 docker run --rm --network host -v "$state:/etc/letsencrypt" \
  -v /var/lib/aeroquetzal-web/certbot:/var/lib/letsencrypt \
  -v /var/log/aeroquetzal-web/certbot:/var/log/letsencrypt \
  -v aeroquetzal-public_acme:/var/www/acme certbot/certbot:v5.9.0 \
  renew --cert-name aeroquetzal-public-domain --non-interactive --quiet --no-random-sleep-on-renew
fi
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt -untrusted "$source_dir/chain.pem" \
 -verify_hostname aeroquetzal.178.104.151.184.sslip.io "$source_dir/cert.pem"
openssl x509 -in "$source_dir/cert.pem" -checkend 86400 -noout
cmp <(openssl x509 -in "$source_dir/cert.pem" -pubkey -noout | openssl pkey -pubin -outform DER) \
 <(openssl pkey -in "$source_dir/privkey.pem" -pubout -outform DER)
install -d -m 700 "$target"
install -m 644 "$source_dir/fullchain.pem" "$target/fullchain.pem.next"
install -m 600 "$source_dir/privkey.pem" "$target/privkey.pem.next"
mv "$target/fullchain.pem.next" "$target/fullchain.pem"
mv "$target/privkey.pem.next" "$target/privkey.pem"
if [[ "${1:-renew}" != install ]]; then docker exec aq-public-web nginx -t && docker exec aq-public-web nginx -s reload; fi
