#!/usr/bin/env bash
set -euo pipefail
ip link show br-public-dmz >/dev/null 2>&1 || ip link add br-public-dmz type bridge
ip address replace 10.10.1.1/28 dev br-public-dmz
ip link set br-public-dmz up
pid="$(docker inspect -f '{{.State.Pid}}' aq-public-web 2>/dev/null || true)"
[[ "${pid:-0}" -gt 0 ]] || exit 0
if nsenter -t "$pid" -n ip -4 address show | grep -q '10.10.1.4/28'; then exit 0; fi
ip link del aq-public0 2>/dev/null || true
ip link add aq-public0 type veth peer name aq-public-p
ip link set aq-public0 master br-public-dmz
ip link set aq-public0 up
ip link set aq-public-p netns "$pid"
nsenter -t "$pid" -n ip link set aq-public-p name eth0
nsenter -t "$pid" -n ip link set lo up
nsenter -t "$pid" -n ip address add 10.10.1.4/28 dev eth0
nsenter -t "$pid" -n ip link set eth0 up
nsenter -t "$pid" -n ip route replace default via 10.10.1.1
