#!/usr/bin/env python3
"""Produce reviewable configs from snapshots of the existing rules; never applies them."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("server", choices=["core", "edge"])
parser.add_argument("input", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
original = args.input.read_text()
if args.server == "core":
    anchor = '    iifname "enp7s0" ip saddr 172.20.0.0/16 ip daddr 10.10.0.0/24 drop'
    if original.count(anchor) != 1:
        raise SystemExit("La configuración base cambió; revisar manualmente antes de preparar el parche")
    additions = '''    # AeroQuetzal web: narrowly scoped exceptions, before the Hetzner blanket drop.
    iifname "enp7s0" ip saddr 172.20.0.2 ip daddr 10.10.0.103 tcp dport 8080 accept
    ip saddr 10.10.0.116 ip daddr 10.10.0.103 tcp dport 8080 accept
    ip saddr { 10.10.0.103, 10.10.0.116 } ip daddr 10.10.0.105 tcp dport 8081 accept
    ip saddr 10.10.0.103 ip daddr 10.10.0.104 tcp dport 5432 accept
    ip saddr { 10.10.0.0/27, 10.10.0.32/28, 10.10.0.48/28, 10.10.0.64/28, 10.200.0.0/24 } ip daddr 10.10.0.116 tcp dport 443 accept
'''
    updated = original.replace(anchor, additions + anchor)
    updated += "\n" + (Path(__file__).parent / "firewall-guard.nft").read_text()
else:
    anchor = "        udp dport 51820 accept"
    if original.count(anchor) != 1:
        raise SystemExit("La configuración base cambió; revisar manualmente")
    rules = []
    public_rule = '        iifname "eth0" tcp dport { 80, 443 } accept'
    visitor_rule = '        iifname "aq-visitor" ip saddr 10.10.0.144/28 ip daddr 178.104.151.184 tcp dport { 80, 443 } accept'
    for rule in [public_rule, visitor_rule]:
        if rule.strip() not in original:
            rules.append(rule)
    updated = original.replace(anchor, anchor + ('\n        # Public web only; no DNAT or internal service publication.\n' + '\n'.join(rules) if rules else ''))
args.output.write_text(updated)
print("Configuración preparada para revisión:", args.output)
