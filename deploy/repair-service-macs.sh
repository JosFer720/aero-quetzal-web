#!/usr/bin/env bash
# Fix the observed duplicate peer MAC on the three legacy service containers.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Ejecutar con sudo en core-app' >&2; exit 1; }
startup=/usr/local/sbin/aeroquetzal-container-net.sh
backup="/var/backups/aeroquetzal-web/service-macs-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$backup"
cp -p "$startup" "$backup/"
python3 - "$startup" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
marker = '  # Unique peer MAC derived from the static IPv4 address.\n'
if marker not in s:
    start = s.index('attach_static() {')
    end = s.index('\nattach_dhcp() {', start)
    function = s[start:end]
    anchor = '  ip link add "$host_if" type veth peer name aqc0\n'
    assert function.count(anchor) == 1, 'Cambió el script base; revisar antes de modificarlo'
    addition = marker + '''  local mac octet1 octet2 octet3 octet4
  IFS=. read -r octet1 octet2 octet3 octet4 <<< "${address%%/*}"
  printf -v mac '02:ae:%02x:%02x:%02x:%02x' "$octet1" "$octet2" "$octet3" "$octet4"
  ip link set aqc0 address "$mac"
'''
    s = s[:start] + function.replace(anchor, anchor + addition) + s[end:]
    p.write_text(s)
PY
bash -n "$startup"
for entry in dns-interno:100 ntp-interno:101 ldap-interno:102; do
  container="${entry%:*}"
  last_octet="${entry##*:}"
  pid="$(docker inspect -f '{{.State.Pid}}' "$container")"
  [[ "$pid" -gt 0 ]]
  printf -v mac '02:ae:0a:0a:00:%02x' "$last_octet"
  nsenter -t "$pid" -n ip link set eth0 address "$mac"
done
# Retire only cached neighbors of the changed interfaces, without restarting services.
for container in dns-interno ntp-interno ldap-interno aq-auth aq-business-api aq-postgres; do
  pid="$(docker inspect -f '{{.State.Pid}}' "$container")"
  for address in 10.10.0.100 10.10.0.101 10.10.0.102; do
    nsenter -t "$pid" -n ip neigh del "$address" dev eth0 2>/dev/null || true
  done
done
for address in 10.10.0.100 10.10.0.101 10.10.0.102; do
  ip neigh del "$address" dev br-servicios 2>/dev/null || true
done
echo 'MAC distintas para DNS, NTP y LDAP, con asignación persistente en el arranque.'
