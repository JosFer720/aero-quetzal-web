#!/usr/bin/env bash
# Demostracion de la fase web. Solo realiza consultas; no modifica datos ni servicios.
set -euo pipefail

cd "$(dirname "$0")"

PUBLIC_URL="https://178.104.151.184/"
INTERNAL_URL="https://intranet.aeroquetzal.internal/"
INTERNAL_IP="10.10.0.116"
INTERNAL_CA="$PWD/secrets/internal-ca.pem"

if [[ $EUID -ne 0 ]]; then
  echo "Ejecutar con sudo desde el checkout de AeroQuetzal:" >&2
  echo "  sudo deploy/demo-fase4.sh" >&2
  exit 1
fi

if [[ ! -s "$INTERNAL_CA" ]]; then
  echo "No se encontro la CA publica de la intranet en deploy/secrets/internal-ca.pem" >&2
  exit 1
fi

for command in docker nsenter curl timeout git; do
  command -v "$command" >/dev/null || {
    echo "Falta el comando requerido: $command" >&2
    exit 1
  }
done

pause_demo() {
  echo
  if [[ -t 0 ]]; then
    read -r -p "[Enter para continuar] "
  fi
  echo
}

section() {
  echo "================================================================"
  echo "$1"
  echo "================================================================"
}

container_pid() {
  docker inspect -f '{{.State.Pid}}' "$1"
}

http_code() {
  local source="$1"
  shift
  nsenter -t "$(container_pid "$source")" -n \
    curl --noproxy '*' --connect-timeout 3 --max-time 8 \
    -sS -o /dev/null -w '%{http_code}' "$@"
}

expect_blocked() {
  local source="$1" address="$2" port="$3"
  if nsenter -t "$(container_pid "$source")" -n timeout 3 \
      bash -c 'exec 3<>"/dev/tcp/$1/$2"' _ "$address" "$port" 2>/dev/null; then
    echo "FALLO: $source alcanzo $address:$port" >&2
    return 1
  fi
  echo "OK: $source no puede alcanzar $address:$port"
}

clear
section "AeroQuetzal - demostracion final de la aplicacion web"
echo "Commit desplegado/documentado:"
git -C .. log -1 --format='  %h  %s'
echo
echo "La prueba es de solo lectura. No crea reservas ni reinicia servicios."
pause_demo

section "1. Servicios de la aplicacion"
printf '%-22s %-12s %-12s\n' "CONTENEDOR" "EJECUCION" "SALUD"
for container in aq-postgres aq-auth aq-business-api aq-internal-web; do
  running="$(docker inspect -f '{{.State.Status}}' "$container")"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}sin healthcheck{{end}}' "$container")"
  printf '%-22s %-12s %-12s\n' "$container" "$running" "$health"
  [[ "$running" == "running" ]]
done
pause_demo

section "2. Acceso a las dos paginas"
public_status="$(http_code visitante01 "$PUBLIC_URL")"
internal_status="$(http_code ti01 --cacert "$INTERNAL_CA" \
  --resolve "intranet.aeroquetzal.internal:443:$INTERNAL_IP" "$INTERNAL_URL")"
echo "Portal publico desde Visitantes: HTTP $public_status"
echo "Intranet desde TI:              HTTP $internal_status"
[[ "$public_status" == "200" && "$internal_status" == "200" ]]
pause_demo

section "3. Segmentacion de Visitantes"
echo "Internet y portal publico permitidos:"
echo "  $PUBLIC_URL -> HTTP $public_status"
echo
echo "Servicios internos bloqueados:"
expect_blocked visitante01 10.10.0.116 443
expect_blocked visitante01 10.10.0.103 8080
expect_blocked visitante01 10.10.0.104 5432
expect_blocked visitante01 10.10.0.105 8081
pause_demo

section "4. API, Auth y PostgreSQL no estan publicados en el host"
for container in aq-postgres aq-auth aq-business-api; do
  mode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$container")"
  published="$(docker inspect -f '{{len .HostConfig.PortBindings}}' "$container")"
  echo "$container: network_mode=$mode, puertos publicados=$published"
  [[ "$mode" == "none" && "$published" == "0" ]]
done
pause_demo

section "5. La intranet exige autenticacion"
session_status="$(http_code ti01 --cacert "$INTERNAL_CA" \
  --resolve "intranet.aeroquetzal.internal:443:$INTERNAL_IP" \
  "${INTERNAL_URL}api/v1/auth/session")"
dashboard_status="$(http_code ti01 --cacert "$INTERNAL_CA" \
  --resolve "intranet.aeroquetzal.internal:443:$INTERNAL_IP" \
  "${INTERNAL_URL}api/v1/internal/dashboard")"
echo "Sesion sin credenciales: HTTP $session_status"
echo "Panel sin credenciales:  HTTP $dashboard_status"
[[ "$session_status" == "200" && "$dashboard_status" == "401" ]]
pause_demo

section "6. Verificacion completa de red y seguridad"
echo "Se ejecutaran las comprobaciones oficiales del despliegue."
echo
"$PWD/verify-core.sh"

echo
section "Demostracion automatizada completada correctamente"
echo "Continuar en el navegador:"
echo "  Publica:   $PUBLIC_URL"
echo "  Intranet:  $INTERNAL_URL (con WireGuard activo)"
