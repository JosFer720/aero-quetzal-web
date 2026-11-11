#!/usr/bin/env bash
set -euo pipefail
ip link show br-ti >/dev/null
pid="$(docker inspect -f '{{.State.Pid}}' aq-snmp-panel 2>/dev/null || true)"
[[ "${pid:-0}" -gt 0 ]] || exit 0
if nsenter -t "$pid" -n ip -4 address show | grep -q '10.10.0.53/28'; then exit 0; fi
ip link del aq-snmp0 2>/dev/null || true
ip link add aq-snmp0 type veth peer name aq-snmp-p
ip link set aq-snmp0 master br-ti
ip link set aq-snmp0 up
ip link set aq-snmp-p netns "$pid"
nsenter -t "$pid" -n ip link set aq-snmp-p name eth0
nsenter -t "$pid" -n ip address add 10.10.0.53/28 dev eth0
nsenter -t "$pid" -n ip link set lo up
nsenter -t "$pid" -n ip link set eth0 up
nsenter -t "$pid" -n ip route replace default via 10.10.0.49
