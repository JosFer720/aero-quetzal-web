#!/usr/bin/env bash
# Isolated local proxy test. Certificates and tokens below are generated only for this disposable test.
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir="$(mktemp -d)"
test_network="aq-gateway-test-$$"
test_upstream="aq-upstream-test-$$"
test_gateway="aq-gateway-test-$$"
# Git Bash otherwise rewrites container paths such as /etc/nginx into Windows paths.
# Only bind sources and OpenSSL output files use host-native paths.
bind_root="$PWD"
bind_tls="$test_dir"
if command -v cygpath >/dev/null 2>&1; then
  bind_root="$(cygpath -m "$PWD")"
  bind_tls="$(cygpath -m "$test_dir")"
  export MSYS_NO_PATHCONV=1
fi
cleanup() {
  docker rm -f "$test_gateway" "$test_upstream" >/dev/null 2>&1 || true
  docker network rm "$test_network" >/dev/null 2>&1 || true
  rm -rf "$test_dir"
}
trap cleanup EXIT
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -keyout "$bind_tls/privkey.pem" -out "$bind_tls/fullchain.pem" >/dev/null 2>&1
docker network create "$test_network" >/dev/null
docker run -d --name "$test_upstream" --network "$test_network" node:24-bookworm-slim \
  node -e 'require("node:http").createServer((q,s)=>{s.setHeader("Set-Cookie","private=should-not-leak");s.setHeader("Content-Type","application/json");s.end(JSON.stringify({token:q.headers["x-aq-gateway-token"],cookie:q.headers.cookie??null}));}).listen(8080,"0.0.0.0")' >/dev/null
docker run -d --name "$test_gateway" --network "$test_network" -p 127.0.0.1:18443:443 \
  -e PUBLIC_HOST=localhost -e BUSINESS_UPSTREAM="$test_upstream:8080" -e PUBLIC_GATEWAY_TOKEN=gateway-test-only \
  -e 'NGINX_ENVSUBST_FILTER=^(PUBLIC_HOST|BUSINESS_UPSTREAM|PUBLIC_GATEWAY_TOKEN)$' \
  -v "$bind_root/deploy/public/default.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  -v "$bind_root/deploy/headers.conf:/etc/nginx/aq-headers.conf:ro" \
  -v "$bind_root/apps/public-web/dist:/usr/share/nginx/html:ro" \
  -v "$bind_tls:/etc/aeroquetzal/tls:ro" nginx:stable-alpine >/dev/null
for attempt in $(seq 1 30); do
  if curl -ksf https://127.0.0.1:18443/ >/dev/null; then break; fi
  if [[ "$attempt" == 30 ]]; then docker logs "$test_gateway"; exit 1; fi
  sleep 1
done
docker exec "$test_gateway" nginx -t
"${PYTHON:-python3}" - <<'PY'
import json, ssl, urllib.error, urllib.request
context = ssl._create_unverified_context()  # Disposable local test certificate only.
def request(method, path):
    req=urllib.request.Request('https://127.0.0.1:18443'+path, method=method,
        headers={'Cookie':'aq_session=must-not-forward', 'X-AQ-Gateway-Token':'forged'})
    try:
        with urllib.request.urlopen(req, context=context) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()
for method,path in [('GET','/api/v1/public/airports'),('GET','/api/v1/public/flights'),
    ('GET','/api/v1/public/flights/fi_123/availability'),('POST','/api/v1/public/reservations'),
    ('GET','/api/v1/public/reservations/AQZZ999?documentNumber=NEVER_LOG_THIS'),
    ('POST','/api/v1/public/reservations/AQZZ999/cancel'),('GET','/api/v1/public/status/AQ118')]:
    status,headers,body=request(method,path)
    assert status==200,(method,path,status,body)
    assert json.loads(body)=={'token':'gateway-test-only','cookie':None}
    assert headers.get('Set-Cookie') is None
for method,path in [('GET','/api/v1/internal/dashboard'),('POST','/api/v1/auth/login'),
    ('GET','/api/v1/auth/session'),('DELETE','/api/v1/public/reservations/AQZZ999'),
    ('POST','/api/v1/public/flights'),('GET','/api/v1/public/unknown'),('GET','/privado/'),('GET','/login/')]:
    assert request(method,path)[0]==404,(method,path)
print('Gateway: rutas/métodos, token, cookies y bloqueo de endpoints internos verificados.')
PY
if docker logs "$test_gateway" 2>&1 | grep -q NEVER_LOG_THIS; then echo 'Query sensible encontrado en logs' >&2; exit 1; fi
