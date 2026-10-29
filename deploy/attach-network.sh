#!/usr/bin/env bash
# Attach only the four new containers to existing bridges. Never creates/replaces a bridge or route on the host.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Ejecutar como root' >&2; exit 1; }
attach() {
  local container="$1" address="$2" gateway="$3" suffix="$4" bridge pid
  bridge="$(ip -o -4 address show | awk -v gw="$gateway/28" '$4 == gw {print $2}')"
  [[ -n "$bridge" ]] || { echo "No se encontró el bridge existente de $gateway" >&2; exit 1; }
  pid="$(docker inspect -f '{{.State.Pid}}' "$container")"
  [[ "$pid" -gt 0 ]] || { echo "Contenedor detenido: $container" >&2; exit 1; }
  if nsenter -t "$pid" -n ip -4 address show | grep -q "$address/28"; then return; fi
  ip link del "aqw-$suffix" 2>/dev/null || true
  ip link add "aqw-$suffix" type veth peer name "aqp-$suffix"
  ip link set "aqw-$suffix" master "$bridge"
  ip link set "aqw-$suffix" up
  ip link set "aqp-$suffix" netns "$pid"
  nsenter -t "$pid" -n ip link set "aqp-$suffix" name eth0
  nsenter -t "$pid" -n ip address add "$address/28" dev eth0
  nsenter -t "$pid" -n ip link set lo up
  nsenter -t "$pid" -n ip link set eth0 up
  nsenter -t "$pid" -n ip route replace default via "$gateway"
}
case "${1:-core}" in
  core)
    attach aq-postgres 10.10.0.104 10.10.0.97 db
    attach aq-auth 10.10.0.105 10.10.0.97 auth
    attach aq-business-api 10.10.0.103 10.10.0.97 api
    ;;
  internal) attach aq-internal-web 10.10.0.116 10.10.0.113 web ;;
  *) echo 'Uso: attach-network.sh core|internal' >&2; exit 1 ;;
esac
