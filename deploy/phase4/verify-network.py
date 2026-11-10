#!/usr/bin/env python3
"""Run on either host; validate permitted and blocked TCP flows from real namespaces."""
import json
import subprocess
import sys

role = sys.argv[1]
checks = []
def check(container, ip, port, allowed):
    pid = subprocess.check_output(['docker','inspect','-f','{{.State.Pid}}',container],text=True).strip()
    code = 'import socket,sys; s=socket.socket(); s.settimeout(2); sys.exit(0 if s.connect_ex((sys.argv[1],int(sys.argv[2])))==0 else 1)'
    result = subprocess.run(['nsenter','-t',pid,'-n','python3','-c',code,ip,str(port)],timeout=5,capture_output=True)
    actual = result.returncode == 0
    checks.append({'source':container,'destination':ip,'port':port,'expected':'allowed' if allowed else 'blocked','passed':actual==allowed})
if role == 'edge':
    check('aq-public-web','10.10.0.103',8080,True)
    for ip,port in [('10.10.0.104',5432),('10.10.0.105',8081),('10.10.0.102',636),('10.10.0.116',443),('10.10.0.52',22),('10.10.1.1',22),('1.1.1.1',443)]:
        check('aq-public-web',ip,port,False)
else:
    for name in ['operador01','checkin01','ti01','monitor01']:
        check(name,'10.10.0.116',443,True)
    for name in ['operador01','checkin01','monitor01','visitante01']:
        check(name,'10.10.0.104',5432,False)
    for ip,port in [('10.10.0.116',443),('10.10.0.103',8080),('10.10.0.105',8081),('10.10.0.102',636),('10.200.0.1',22)]:
        check('visitante01',ip,port,False)
    check('visitante01','1.1.1.1',443,True)
    check('aq-internal-web','10.10.0.103',8080,True)
    check('aq-internal-web','10.10.0.105',8081,True)
    check('aq-business-api','10.10.0.104',5432,True)
    check('aq-auth','10.10.0.102',636,True)
print(json.dumps({'role':role,'checks':checks},indent=2))
if not all(x['passed'] for x in checks): raise SystemExit(1)
