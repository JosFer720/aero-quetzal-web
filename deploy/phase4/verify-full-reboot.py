#!/usr/bin/env python3
"""Sequentially reboot the two authorized project VMs and verify recovery/data integrity."""
import datetime
import json
from pathlib import Path
import shlex
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
IDENTITY = '/Users/joseruiz/.ssh/aeroquetzal_hetzner'
SNAPSHOT = r'''
import json,subprocess,pathlib
def run(args):
 p=subprocess.run(args,capture_output=True,text=True,timeout=20)
 return p.stdout.strip() if p.returncode==0 else None
host=run(['hostname'])
names=run(['docker','ps','-a','--format','{{.Names}}'])
containers={}
if names:
 for name in names.splitlines():
  raw=run(['docker','inspect','--format','{{json .State}}',name])
  if raw:
   state=json.loads(raw);containers[name]={'state':state['Status'],'health':state.get('Health',{}).get('Status')}
services=['docker','nftables','snmpd']+(['aeroquetzal-network','aeroquetzal-dhcp','aeroquetzal-containers','aeroquetzal-web-network','aeroquetzal-snmp.timer','aeroquetzal-snmp-panel-network.timer'] if host=='core-app' else ['wg-quick@wg0','aeroquetzal-public-route.timer','aeroquetzal-public-dmz.timer','aeroquetzal-domain-tls.timer'])
data={'hostname':host,'boot_id':pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'uptime_seconds':float(pathlib.Path('/proc/uptime').read_text().split()[0]),'containers':containers,'services':{name:run(['systemctl','is-active',name]) for name in services},'default_route':run(['ip','route','show','default'])}
if host=='core-app':
 sql="SELECT json_build_object('reservations',count(*),'reservation_signature',md5(coalesce(string_agg(code||status::text,'|' ORDER BY code),'')),'seats',(SELECT count(*) FROM seat_assignments),'seat_signature',(SELECT md5(coalesce(string_agg(reservation_passenger_id||seat_number,'|' ORDER BY reservation_passenger_id),'')) FROM seat_assignments)) FROM reservations;"
 raw=run(['docker','exec','aq-postgres','psql','-U','aeroquetzal','-d','aeroquetzal','-Atc',sql])
 data['database']=json.loads(raw) if raw else None
 history=pathlib.Path('/var/lib/aeroquetzal-snmp/panel/history.json')
 if history.exists():
  rows=json.loads(history.read_text());data['history_samples']=len(rows);data['history_first']=rows[0]['timestamp'] if rows else None
 else:data['history_samples']=0;data['history_first']=None
print(json.dumps(data))
'''

def command(role,script,timeout=35):
 address='10.200.0.1' if role=='edge' else '172.20.0.3'
 options=['ssh','-i',IDENTITY,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=5']
 if role=='edge': options+=['-o','HostKeyAlias=178.104.151.184']
 return subprocess.run(options+['root@'+address,script],capture_output=True,text=True,timeout=timeout)

def snapshot(role):
 response=command(role,'python3 -c '+shlex.quote(SNAPSHOT))
 if response.returncode: raise RuntimeError('SSH aún no disponible en '+role)
 return json.loads(response.stdout)

def ready(data,role):
 expected=['aq-public-web'] if role=='edge' else ['operador01','checkin01','ti01','monitor01','visitante01','dns-interno','ntp-interno','ldap-interno','aq-postgres','aq-business-api','aq-auth','aq-internal-web','aq-snmp-panel']
 return all(data['services'].values()) and all(state=='active' for state in data['services'].values()) and all(data['containers'].get(name,{}).get('state')=='running' and data['containers'][name]['health'] in (None,'healthy') for name in expected) and (role=='edge' or data.get('database') is not None)

result={'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'order':['core','edge'],'hosts':{}}
for role in ['core','edge']:
 before=snapshot(role)
 assert ready(before,role), 'Los servicios previos no están sanos en '+role
 print('Reiniciando '+role+'; boot_id anterior '+before['boot_id'],flush=True)
 response=command(role,'systemctl reboot',timeout=15)
 if response.returncode not in (0,255): raise RuntimeError('No se aceptó el reinicio de '+role)
 deadline=time.monotonic()+240
 after=None
 while time.monotonic()<deadline:
  time.sleep(4)
  try:
   data=snapshot(role)
   if data['boot_id']!=before['boot_id'] and ready(data,role): after=data;break
  except (RuntimeError,subprocess.TimeoutExpired,ValueError): pass
 if after is None: raise RuntimeError('No se recuperaron todos los servicios de '+role+' en 240 segundos; revisar antes de continuar')
 if role=='core':
  assert before['database']==after['database'], 'Cambió el inventario de reservas/asientos durante el reinicio'
  assert not after['default_route'], 'El núcleo tiene una ruta por defecto general inesperada'
  assert after['history_samples']>=before['history_samples'], 'Se perdió historial SNMP'
 result['hosts'][role]={'before':before,'after':after,'passed':True}
 (ROOT/'validacion-reinicio-vm.json').write_text(json.dumps(result,indent=2)+'\n')
 print(role+' recuperado automáticamente; boot_id nuevo '+after['boot_id'],flush=True)

refresh=command('core','systemctl start aeroquetzal-snmp.service')
assert refresh.returncode==0,'El colector no volvió a consultar ambos agentes'
verify=subprocess.run(['python3',str(ROOT/'infra/verify-persistence.py')],capture_output=True,text=True,timeout=60)
assert verify.returncode==0,'Falló verificación final de HTTPS/reserva/asiento: '+verify.stderr[-500:]
result['https_and_booking']=json.loads(verify.stdout)
result['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
result['passed']=True
(ROOT/'validacion-reinicio-vm.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'hosts':list(result['hosts']),'report':str(ROOT/'validacion-reinicio-vm.json')}),flush=True)
