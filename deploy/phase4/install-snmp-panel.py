#!/usr/bin/env python3
"""Install the private TI-only SNMP visualization; never publishes host ports."""
from pathlib import Path
import re
import shutil
import subprocess

source = Path('/root/aq-phase4-src')
destination = Path('/opt/aeroquetzal-snmp-panel')
backup = Path('/root/aq-phase4-backup')
backup.mkdir(mode=0o700,exist_ok=True)
lib = Path('/usr/local/lib/aeroquetzal-phase4')
lib.mkdir(parents=True,exist_ok=True)
for name in ('snmp-collect.py','snmp_panel.py','snmp-panel-network.sh'):
    target = lib/name
    if target.exists() and not (backup/(name+'.before-panel')).exists():
        shutil.copy2(target,backup/(name+'.before-panel'))
    shutil.copy2(source/name,target)
    target.chmod(0o755)
subprocess.run(['systemctl','start','aeroquetzal-snmp.service'],check=True)
shutil.copytree(source/'snmp-panel',destination,dirs_exist_ok=True)
for path in destination.rglob('*'):
    path.chmod(0o755 if path.is_dir() else 0o644)
destination.chmod(0o755)

live = subprocess.check_output(['nft','-s','list','ruleset'],text=True)
if 'table inet aq4_snmp_panel' not in live:
    rules = '''table inet aq4_snmp_panel {
 chain forward {
  type filter hook forward priority -40; policy accept;
  ct state established,related accept
  ip daddr 10.10.0.53 tcp dport 8080 ip saddr != 10.10.0.48/28 drop
  ip saddr 10.10.0.53 ct state new drop
 }
}
table bridge aq4_snmp_panel {
 chain forward {
  type filter hook forward priority -200; policy accept;
  ct state established,related accept
  ether type ip ip daddr 10.10.0.53 tcp dport 8080 ip saddr != 10.10.0.48/28 drop
  ether type ip ip saddr 10.10.0.53 ct state new drop
 }
}
'''
    file = backup/'snmp-panel-guard.nft'
    file.write_text(rules)
    subprocess.run(['nft','-c','-f',str(file)],check=True)
    subprocess.run(['nft','-f',str(file)],check=True)
    candidate = backup/'nftables.with-snmp-panel.conf'
    candidate.write_text('#!/usr/sbin/nft -f\nflush ruleset\n'+subprocess.check_output(['nft','-s','list','ruleset'],text=True))
    subprocess.run(['nft','-c','-f',str(candidate)],check=True)
    shutil.copy2(candidate,'/etc/nftables.conf')

zone = Path('/opt/aeroquetzal/coredns/aeroquetzal.internal.zone')
text = zone.read_text()
if not re.search(r'^snmp\s+IN\s+A\s+10\.10\.0\.53\s*$',text,re.M):
    if re.search(r'^snmp\s+',text,re.M): raise SystemExit('Existe un registro snmp distinto; revisar antes de sustituirlo')
    if not (backup/'dns.before-snmp-panel.zone').exists(): shutil.copy2(zone,backup/'dns.before-snmp-panel.zone')
    text = re.sub(r'\b(20\d{8})\b',lambda match:str(max(int(match[1])+1,2026111003)),text,count=1)
    zone.write_text(text.rstrip()+'\nsnmp IN A 10.10.0.53\n')
    # CoreDNS file plugin checks the serial periodically; a service restart is unnecessary.

for name in ('aeroquetzal-snmp-panel-network.service','aeroquetzal-snmp-panel-network.timer'):
    shutil.copy2(source/name,Path('/etc/systemd/system')/name)
subprocess.run(['docker','compose','-f',str(destination/'docker-compose.yml'),'config','--quiet'],check=True)
subprocess.run(['docker','compose','-f',str(destination/'docker-compose.yml'),'up','-d'],check=True)
subprocess.run([str(lib/'snmp-panel-network.sh')],check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','aeroquetzal-snmp-panel-network.timer'],check=True)
print('Panel SNMP: 10.10.0.53:8080, solamente TI, sin publicación de puertos')
