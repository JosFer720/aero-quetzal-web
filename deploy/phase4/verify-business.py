#!/usr/bin/env python3
"""Live smoke test. Creates ONLY fictitious reservations, one cancelled and one checked in."""
import datetime
import http.cookiejar
import json
from pathlib import Path
import secrets
import ssl
import subprocess
import urllib.error
import urllib.parse
import urllib.request

public = 'https://aeroquetzal.178.104.151.184.sslip.io'
internal = 'https://intranet.aeroquetzal.internal'
ca = '/Users/joseruiz/Desktop/lab6redes/AeroQuetzal-Intranet-CA.pem'
ctx = ssl.create_default_context(cafile=ca)
ctx.load_default_certs()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), urllib.request.HTTPSHandler(context=ctx))
results = []

def call(base, path, method='GET', body=None, csrf=None, expected=200):
    headers = {'Accept':'application/json'}
    if method != 'GET': headers['Origin'] = base
    if csrf: headers['X-CSRF-Token'] = csrf
    payload = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        payload = json.dumps(body).encode()
    request = urllib.request.Request(base+path,data=payload,headers=headers,method=method)
    try:
        response = opener.open(request,timeout=15)
        code, data = response.status, response.read()
    except urllib.error.HTTPError as error:
        code, data = error.code, error.read()
    assert code == expected, (path,code,data[:200])
    results.append({'path':path.split('?')[0],'method':method,'status':code,'passed':True})
    try: return json.loads(data)
    except ValueError: return None

airports = call(public,'/api/v1/public/airports')
assert len(airports)>=2
tomorrow = (datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-6))).date()+datetime.timedelta(days=1)).isoformat()
flights = call(public,'/api/v1/public/flights?'+urllib.parse.urlencode({'origin':'GUA','destination':'SAL','date':tomorrow}))
assert flights, 'No hay vuelos futuros disponibles'
flight = flights[0]
availability_path = '/api/v1/public/flights/'+flight['id']+'/availability'
before = call(public,availability_path)['availableSeats']
document = 'PH4'+secrets.token_hex(5).upper()
body = {'flightInstanceId':flight['id'],'contactEmail':'phase4@example.invalid','passengers':[{'firstName':'Prueba','lastName':'Fase Cuatro','documentNumber':document}]}
made = call(public,'/api/v1/public/reservations','POST',body,expected=201)
code = made['code']
assert call(public,availability_path)['availableSeats']==before-1
lookup = '/api/v1/public/reservations/'+code
call(public,lookup+'?documentNumber='+document)
call(public,lookup+'?documentNumber=INVALIDPHASE4',expected=404)
call(public,lookup+'/cancel','POST',{'documentNumber':document})
assert call(public,availability_path)['availableSeats']==before
body['passengers'][0]['documentNumber'] = 'PH4'+secrets.token_hex(5).upper()
second = call(public,'/api/v1/public/reservations','POST',body,expected=201)['code']
call(internal,'/api/v1/internal/dashboard',expected=401)
password = subprocess.check_output(['ssh','-i','/Users/joseruiz/.ssh/aeroquetzal_hetzner','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','root@172.20.0.3','cat /root/aeroquetzal-secrets/ldap-ti-demo-password'],text=True).strip()
session = call(internal,'/api/v1/auth/login','POST',{'username':'ti-demo','password':password})
del password
assert session['authenticated'] and 'admin' in session['user']['roles']
token = session['csrfToken']
call(internal,'/api/v1/internal/dashboard')
detail = call(internal,'/api/v1/internal/reservations/'+second)
checkin = '/api/v1/internal/reservations/'+second+'/check-in'
call(internal,checkin,'POST',{},csrf='invalid-token',expected=403)
checked = call(internal,checkin,'POST',{},csrf=token)
repeated = call(internal,checkin,'POST',{},csrf=token)
assert checked == repeated and checked['seats']
call(public,'/api/v1/public/reservations/'+second+'/cancel','POST',{'documentNumber':body['passengers'][0]['documentNumber']},expected=409)
events = call(internal,'/api/v1/internal/audit')
assert any(x['entityId']==detail['id'] and x['action']=='CHECK_IN' for x in events)
for path in ['/api/v1/internal/dashboard','/api/v1/auth/session','/privado/']:
    call(public,path,expected=404)
call(internal,'/api/v1/auth/logout','POST',csrf=token,expected=204)
call(internal,'/api/v1/internal/dashboard',expected=401)
report = {'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'public':public,'internal':internal,'flight_date':tomorrow,'cancelled_test_reservation':code,'checked_in_test_reservation':second,'checks':results}
target = Path(__file__).resolve().parents[1]/'validacion-negocio.json'
target.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':len(results),'date':tomorrow,'cancelled_test_reservation':code,'checked_in_test_reservation':second,'report':str(target)},indent=2))
