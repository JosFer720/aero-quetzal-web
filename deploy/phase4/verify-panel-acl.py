#!/usr/bin/env python3
import json
import subprocess

checks=[]
probe='import socket,sys;s=socket.socket();s.settimeout(2);sys.exit(0 if s.connect_ex(("10.10.0.53",8080))==0 else 1)'
for name,allowed in [('ti01',True),('operador01',False),('checkin01',False),('monitor01',False),('visitante01',False)]:
    pid=subprocess.check_output(['docker','inspect','-f','{{.State.Pid}}',name],text=True).strip()
    result=subprocess.run(['nsenter','-t',pid,'-n','python3','-c',probe],timeout=5)
    checks.append({'source':name,'destination':'10.10.0.53:8080','expected':'allowed' if allowed else 'blocked','passed':(result.returncode==0)==allowed})
print(json.dumps({'checks':checks},indent=2))
if not all(row['passed'] for row in checks):raise SystemExit(1)
