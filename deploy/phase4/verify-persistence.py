#!/usr/bin/env python3
"""Read the existing fictitious reservation after restarting services; creates no records."""
import http.cookiejar
import json
from pathlib import Path
import ssl
import subprocess
import urllib.request

root = Path(__file__).resolve().parents[1]
report = json.loads((root/'validacion-negocio.json').read_text())
ctx = ssl.create_default_context(cafile='/Users/joseruiz/Desktop/lab6redes/AeroQuetzal-Intranet-CA.pem')
ctx.load_default_certs()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),urllib.request.HTTPSHandler(context=ctx))
origin = report['internal']
password = subprocess.check_output(['ssh','-i','/Users/joseruiz/.ssh/aeroquetzal_hetzner','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','root@172.20.0.3','cat /root/aeroquetzal-secrets/ldap-ti-demo-password'],text=True).strip()
request = urllib.request.Request(origin+'/api/v1/auth/login',data=json.dumps({'username':'ti-demo','password':password}).encode(),headers={'Origin':origin,'Content-Type':'application/json'})
session = json.load(client.open(request,timeout=15))
del password
code = report['checked_in_test_reservation']
booking = json.load(client.open(origin+'/api/v1/internal/reservations/'+code,timeout=15))
assert booking['status']=='CHECKED_IN'
assert booking['passengers'] and all(x['seatNumber'] and x['checkedInAt'] for x in booking['passengers'])
for base in (report['public'],origin):
    response = client.open(base+'/',timeout=15)
    assert response.status==200
logout = urllib.request.Request(origin+'/api/v1/auth/logout',method='POST',headers={'Origin':origin,'X-CSRF-Token':session['csrfToken']})
assert client.open(logout,timeout=15).status==204
print(json.dumps({'persisted_reservation':code,'status':booking['status'],'seat_preserved':True,'public_https':True,'internal_https':True}))
