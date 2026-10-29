#!/usr/bin/env bash
# Read-only checks on core-app, using the real network namespaces and trusted CAs.
set -euo pipefail
cd "$(dirname "$0")"
[[ $EUID -eq 0 ]] || { echo 'Ejecutar con sudo en core-app' >&2; exit 1; }
ca="$PWD/secrets/internal-ca.pem"
[[ -s "$ca" ]] || { echo 'Falta la CA pública de la intranet' >&2; exit 1; }
checks=0
pid_of() { docker inspect -f '{{.State.Pid}}' "$1"; }
expect_http() {
  local source="$1" expected="$2" url="$3" actual
  local -a ca_args=()
  shift 3
  if [[ "$url" == https://intranet.aeroquetzal.internal/* ]]; then
    ca_args=(--cacert "$ca" --resolve intranet.aeroquetzal.internal:443:10.10.0.116)
  fi
  actual="$(nsenter -t "$(pid_of "$source")" -n curl --noproxy '*' --connect-timeout 3 --max-time 8 \
    "${ca_args[@]}" \
    -sS -o /dev/null -w '%{http_code}' "$@" "$url")"
  [[ "$actual" == "$expected" ]] || { echo "FALLO: $source $url: $actual, esperado $expected" >&2; exit 1; }
  checks=$((checks + 1))
  echo "OK: $source $url -> $actual"
}
expect_blocked() {
  local source="$1" address="$2" port="$3"
  if nsenter -t "$(pid_of "$source")" -n timeout 3 bash -c \
      'exec 3<>"/dev/tcp/$1/$2"' _ "$address" "$port" 2>/dev/null; then
    echo "FALLO: $source puede llegar a $address:$port" >&2; exit 1
  fi
  checks=$((checks + 1))
  echo "OK: $source bloqueado hacia $address:$port"
}
for container in aq-postgres aq-auth aq-business-api aq-internal-web; do
  [[ "$(docker inspect -f '{{.State.Running}}' "$container")" == true ]]
  [[ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$container")" == none ]]
  [[ "$(docker inspect -f '{{len .HostConfig.PortBindings}}' "$container")" == 0 ]]
done
for container in aq-postgres aq-auth aq-business-api; do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$container")" == healthy ]]
done
if docker inspect intranet >/dev/null 2>&1; then
  echo 'FALLO: existe el contenedor de la intranet anterior' >&2; exit 1
fi
for source in operador01 checkin01 ti01 monitor01; do
  expect_http "$source" 200 https://intranet.aeroquetzal.internal/
  expect_http "$source" 401 https://intranet.aeroquetzal.internal/api/v1/internal/dashboard
done
expect_http ti01 200 https://intranet.aeroquetzal.internal/api/v1/auth/session
expect_http ti01 403 https://intranet.aeroquetzal.internal/api/v1/auth/login \
  -H 'Content-Type: application/json' -H 'Origin: https://example.invalid' --data '{}'
expect_http ti01 200 http://10.10.0.103:8080/health
expect_http ti01 403 http://10.10.0.103:8080/api/v1/public/airports
expect_http aq-business-api 200 http://10.10.0.105:8081/health
for address in 10.10.0.103:8080 10.10.0.104:5432 10.10.0.105:8081 10.10.0.116:443 10.10.0.102:636; do
  expect_blocked visitante01 "${address%:*}" "${address##*:}"
done
expect_blocked operador01 10.10.0.103 8080
expect_blocked operador01 10.10.0.104 5432
expect_blocked operador01 10.10.0.105 8081
# A numeric public destination tests Internet egress without relying on local DNS.
expect_http visitante01 301 http://1.1.1.1/
expect_http visitante01 200 https://178.104.151.184/
for record in api postgres auth; do
  docker exec ti01 nslookup "$record.aeroquetzal.internal" 10.10.0.100 >/dev/null
done
# Use the application's LDAP client as well: an invalid synthetic identity must
# receive LDAP error 49, rather than a connection/TLS/directory error.
docker exec aq-auth node --input-type=module -e '
import { Client, InvalidCredentialsError } from "ldapts";
const c = new Client({url: process.env.LDAP_URL, timeout: 5000, connectTimeout: 5000,
  tlsOptions: {rejectUnauthorized: true, minVersion: "TLSv1.2"}});
try {
  await c.bind("uid=aq-nonexistent-validation,ou=People,dc=aeroquetzal,dc=internal", "invalid-synthetic-only");
  process.exitCode = 1;
} catch (e) {
  if (!(e instanceof InvalidCredentialsError)) process.exitCode = 1;
} finally { await c.unbind().catch(() => {}); }
'
systemctl is-active --quiet aeroquetzal-web-network.service
echo "Core: $checks verificaciones HTTP/red, contenedores saludables, DNS y LDAPS válidos."
