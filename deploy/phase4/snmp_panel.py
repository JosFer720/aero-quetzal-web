"""Publish sanitized numeric SNMP data and a persistent 48-hour history."""
import datetime
import json
import os
from pathlib import Path
import re
import subprocess

PANEL = Path('/var/lib/aeroquetzal-snmp/panel')
ROOTS = {
    'name': '.1.3.6.1.2.1.31.1.1.1.1',
    'status': '.1.3.6.1.2.1.2.2.1.8',
    'rx': '.1.3.6.1.2.1.31.1.1.1.6',
    'tx': '.1.3.6.1.2.1.31.1.1.1.10',
}

def number(value):
    if not isinstance(value, str): return None
    match = re.search(r'\((\d+)\)', value) if 'Timeticks:' in value else re.search(r':\s*"?(-?[\d.]+)', value)
    return float(match.group(1)) if match else None

def table(pid, target, address, oid):
    run = subprocess.run(['nsenter','-t',pid,'-n','/usr/bin/snmpbulkwalk','-On','-t','2','-r','0','udp:'+address,oid],
                         env={**os.environ,'SNMPCONFPATH':'/etc/aeroquetzal/snmp/'+target,'MIBS':''}, capture_output=True,text=True,timeout=15)
    if run.returncode: return {}
    output = {}
    for line in run.stdout.splitlines():
        key, sep, value = line.partition(' = ')
        if not sep or not key.startswith(oid+'.'): continue
        index = key.removeprefix(oid+'.')
        output[index] = value.partition(': ')[2].strip('"') if 'STRING:' in value else number(value)
    return output

def publish(result, pid):
    PANEL.mkdir(mode=0o755, exist_ok=True)
    os.chmod(PANEL,0o755)
    try: old = json.loads((PANEL/'metrics.json').read_text())
    except (FileNotFoundError,ValueError): old = {}
    try: history = json.loads((PANEL/'history.json').read_text())
    except (FileNotFoundError,ValueError): history = []
    timestamp = result['timestamp']
    elapsed = (datetime.datetime.fromisoformat(timestamp)-datetime.datetime.fromisoformat(old['timestamp'])).total_seconds() if old.get('timestamp') else 0
    targets = {}
    for target, item in result['targets'].items():
        values = item['values']
        total = number(values.get('memory_total_kb'))
        free = number(values.get('memory_available_kb'))
        cached = number(values.get('memory_cached_kb'))
        buffers = number(values.get('memory_buffers_kb'))
        usage = max(0,min(100,(total-free-(cached or 0)-(buffers or 0))/total*100)) if total and free is not None else None
        uptime = number(values.get('uptime'))
        previous = old.get('targets',{}).get(target,{})
        previous_if = {str(row['index']):row for row in previous.get('interfaces',[])}
        rebooted = uptime is not None and previous.get('uptime_ticks') is not None and uptime < previous['uptime_ticks']
        tables = {name: table(pid,target,item['address'],oid) for name,oid in ROOTS.items()} if item['ok'] else {name:{} for name in ROOTS}
        interfaces = []
        for index, name in tables['name'].items():
            rx,tx = tables['rx'].get(index),tables['tx'].get(index)
            prev = previous_if.get(index,{})
            def rate(key, current):
                before = prev.get(key)
                return (current-before)*8/elapsed/1_000_000 if not rebooted and elapsed>0 and current is not None and before is not None and current>=before else None
            interfaces.append({'index':int(index),'name':name,'up':tables['status'].get(index)==1,'rx_bytes':rx,'tx_bytes':tx,'rx_mbps':rate('rx_bytes',rx),'tx_mbps':rate('tx_bytes',tx)})
        interfaces.sort(key=lambda x:(not x['up'],x['name']))
        uplink = next((x for x in interfaces if x['name']==('eth0' if target=='edge' else 'enp7s0')), {})
        targets[target] = {'name':'edge-vpn' if target=='edge' else 'core-app','address':item['address'],'ok':item['ok'],'uptime_ticks':uptime,'load_1min':number(values.get('load_1min')),'memory_total_mib':total/1024 if total else None,'memory_used_percent':usage,'interface_count':number(values.get('interfaces')),'interfaces':interfaces,'rx_mbps':uplink.get('rx_mbps'),'tx_mbps':uplink.get('tx_mbps')}
    metrics = {'timestamp':timestamp,'interval_seconds':60,'source':result['source'],'security':'SNMPv3 · SHA-256 / AES · authPriv · solo lectura','targets':targets}
    sample = {'timestamp':timestamp,'targets':{key:{name:value[name] for name in ('ok','load_1min','memory_used_percent','rx_mbps','tx_mbps')} for key,value in targets.items()}}
    history.append(sample)
    cutoff = datetime.datetime.fromisoformat(timestamp)-datetime.timedelta(hours=48)
    history = [row for row in history if datetime.datetime.fromisoformat(row['timestamp'])>=cutoff]
    history = history[-2880:]
    for filename, data in [('metrics.json',metrics),('history.json',history)]:
        temporary = PANEL/(filename+'.tmp')
        temporary.write_text(json.dumps(data,separators=(',',':'))+'\n')
        os.chmod(temporary,0o644)
        temporary.replace(PANEL/filename)
