#!/usr/bin/env bash
# Private CA key stays on core-app, outside the checkout and container mounts.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Ejecutar con sudo en core-app' >&2; exit 1; }
cd "$(dirname "$0")"
[[ "${1:-}" == '' || "${1:-}" == --replace ]] || exit 1
if [[ -e secrets/internal-tls/fullchain.pem && "${1:-}" != --replace ]]; then
  echo 'Ya existe un certificado. Revisarlo antes de usar --replace.' >&2; exit 1
fi
umask 077
state=/etc/aeroquetzal-web/internal-ca
install -d -m 0700 "$state" secrets/internal-tls
if [[ -e secrets/internal-tls/fullchain.pem ]]; then
  backup="/var/backups/aeroquetzal-web/internal-tls-$(date -u +%Y%m%dT%H%M%SZ)"
  install -d -m 0700 "$backup"
  cp -p secrets/internal-tls/*.pem "$backup/"
  [[ ! -e secrets/internal-ca.pem ]] || cp -p secrets/internal-ca.pem "$backup/"
fi
if [[ ! -e "$state/ca.pem" && ! -e "$state/ca.key" ]]; then
  openssl req -new -x509 -newkey rsa:3072 -noenc -sha256 -days 3650 \
    -subj '/CN=AeroQuetzal Intranet CA/O=AeroQuetzal' \
    -addext 'basicConstraints=critical,CA:TRUE' \
    -addext 'keyUsage=critical,keyCertSign,cRLSign' \
    -addext 'subjectKeyIdentifier=hash' \
    -keyout "$state/ca.key" -out "$state/ca.pem" 2>/dev/null
fi
[[ -s "$state/ca.key" && -s "$state/ca.pem" ]] || { echo 'Estado de CA incompleto' >&2; exit 1; }
temporary="$(mktemp -d "$state/leaf.XXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT
cat > "$temporary/extensions.cnf" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:intranet.aeroquetzal.internal,IP:10.10.0.116
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always,issuer
EOF
openssl req -new -newkey rsa:2048 -noenc -sha256 \
  -subj '/CN=intranet.aeroquetzal.internal/O=AeroQuetzal' \
  -keyout "$temporary/privkey.pem" -out "$temporary/request.pem" 2>/dev/null
openssl x509 -req -sha256 -days 365 -in "$temporary/request.pem" \
  -CA "$state/ca.pem" -CAkey "$state/ca.key" -CAcreateserial \
  -extfile "$temporary/extensions.cnf" -out "$temporary/cert.pem" 2>/dev/null
openssl verify -x509_strict -purpose sslserver -CAfile "$state/ca.pem" \
  -verify_hostname intranet.aeroquetzal.internal "$temporary/cert.pem"
openssl verify -x509_strict -purpose sslserver -CAfile "$state/ca.pem" \
  -verify_ip 10.10.0.116 "$temporary/cert.pem"
cat "$temporary/cert.pem" "$state/ca.pem" > "$temporary/fullchain.pem"
install -m 0644 "$temporary/fullchain.pem" secrets/internal-tls/fullchain.pem
install -m 0600 "$temporary/privkey.pem" secrets/internal-tls/privkey.pem
install -m 0644 "$state/ca.pem" secrets/internal-ca.pem
if [[ "$(docker inspect -f '{{.State.Running}}' aq-internal-web 2>/dev/null || true)" == true ]]; then
  docker exec aq-internal-web nginx -t
  docker exec aq-internal-web nginx -s reload
fi
echo 'TLS interno validado. Distribuir sólo secrets/internal-ca.pem a los clientes autorizados.'
