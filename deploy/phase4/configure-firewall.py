#!/usr/bin/env python3
"""Preserve current rules, add the scoped phase-4 rules, validate, then load atomically."""
from pathlib import Path
import subprocess
import sys
import time

role = sys.argv[1]
assert role in {"edge", "core"}
backup = Path('/root/aq-phase4-backup')
backup.mkdir(mode=0o700, exist_ok=True)
live = subprocess.check_output(['nft', '-s', 'list', 'ruleset'], text=True)
if not (backup / 'nftables.live.before.conf').exists():
    (backup / 'nftables.live.before.conf').write_text('#!/usr/sbin/nft -f\nflush ruleset\n' + live)
    (backup / 'nftables.persist.before.conf').write_bytes(Path('/etc/nftables.conf').read_bytes())

if role == 'edge':
    if 'comment "aq4-snmp-ti"' not in live:
        subprocess.run(['nft','insert','rule','inet','edge','input','iifname','enp7s0','ip','saddr','10.10.0.52','ip','daddr','172.20.0.2','udp','dport','161','accept','comment','"aq4-snmp-ti"'],check=True)
    if 'comment "aq4-dmz-web"' not in live:
        subprocess.run(['nft','insert','rule','inet','edge','forward','oifname','br-public-dmz','ip','daddr','10.10.1.4','tcp','dport','{ 80, 443 }','ct','status','dnat','accept','comment','"aq4-dmz-web"'],check=True)
    if 'comment "aq4-dmz-api"' not in live:
        subprocess.run(['nft','insert','rule','inet','edge','forward','iifname','br-public-dmz','ip','saddr','10.10.1.4','ip','daddr','10.10.0.103','tcp','dport','8080','accept','comment','"aq4-dmz-api"'],check=True)
    table = '''table inet aq4_dmz_guard {
 chain input {
  type filter hook input priority -30; policy accept;
  ct state established,related accept
  iifname "br-public-dmz" drop
 }
 chain forward {
  type filter hook forward priority -30; policy accept;
  ct state established,related accept
  iifname "br-public-dmz" ip saddr 10.10.1.4 ip daddr 10.10.0.103 tcp dport 8080 accept
  iifname "br-public-dmz" drop
  oifname "br-public-dmz" ip daddr 10.10.1.4 tcp dport { 80, 443 } ct status dnat accept
  oifname "br-public-dmz" drop
 }
}
table ip aq4_dmz_nat {
 chain prerouting {
  type nat hook prerouting priority dstnat; policy accept;
  ip daddr 178.104.151.184 tcp dport { 80, 443 } dnat to 10.10.1.4
 }
 chain output {
  type nat hook output priority -100; policy accept;
  ip daddr 178.104.151.184 tcp dport { 80, 443 } dnat to 10.10.1.4
 }
 chain postrouting {
  type nat hook postrouting priority 90; policy accept;
  ip saddr 10.10.1.4 ip daddr 10.10.0.103 tcp dport 8080 snat to 172.20.0.2
  ip saddr 178.104.151.184 ip daddr 10.10.1.4 snat to 10.10.1.1
 }
}
'''
    if 'table inet aq4_dmz_guard' not in live:
        staged = backup / 'dmz-add.nft'
        staged.write_text(table)
        subprocess.run(['nft','-c','-f',str(staged)],check=True)
        subprocess.run(['nft','-f',str(staged)],check=True)
else:
    if 'comment "aq4-snmp-ti"' not in live:
        subprocess.run(['nft','insert','rule','inet','aeroquetzal','input','iifname','br-ti','ip','saddr','10.10.0.52','ip','daddr','10.10.0.49','udp','dport','161','accept','comment','"aq4-snmp-ti"'],check=True)
    if 'comment "aq4-snmp-return"' not in live:
        subprocess.run(['nft','insert','rule','inet','aeroquetzal','forward','iifname','enp7s0','ip','saddr','172.20.0.2','ip','daddr','10.10.0.52','udp','sport','161','ct','state','established','accept','comment','"aq4-snmp-return"'],check=True)
candidate = backup / ('nftables.phase4-' + str(int(time.time())) + '.conf')
candidate.write_text('#!/usr/sbin/nft -f\nflush ruleset\n' + subprocess.check_output(['nft','-s','list','ruleset'],text=True))
subprocess.run(['nft','-c','-f',str(candidate)],check=True)
subprocess.run(['install','-m','0644',str(candidate),'/etc/nftables.conf'],check=True)
print('ACL fase 4 aplicadas y persistidas; copia anterior en', backup)
