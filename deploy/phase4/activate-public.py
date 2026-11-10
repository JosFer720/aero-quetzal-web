#!/usr/bin/env python3
"""Migrate only the public container to an isolated DMZ, preserving secrets/TLS."""
from pathlib import Path
import subprocess

root = Path('/opt/aeroquetzal-web/deploy')
source = Path('/root/aq-phase4-src')
backup = Path('/root/aq-phase4-backup')
backup.mkdir(mode=0o700, exist_ok=True)
compose = root / 'public/docker-compose.yml'
template = root / 'public/default.conf.template'
env = root / 'secrets/public.env'
for name, path in (('public-compose.yml', compose), ('public.conf.template', template), ('public.env', env)):
    target = backup / name
    if not target.exists():
        target.write_bytes(path.read_bytes())
        target.chmod(0o600)
data = compose.read_text().replace('network_mode: host', 'network_mode: none')
mount = '      - ../public/default.conf.template:/etc/nginx/templates/default.conf.template:ro\n      - ../secrets/public-domain-tls:/etc/aeroquetzal/domain-tls:ro\n'
if '../secrets/public-domain-tls' not in data:
    data = data.replace('    volumes:\n', '    volumes:\n' + mount)
if 'security_opt:' not in data:
    data = data.replace('    restart: unless-stopped', '    security_opt: [no-new-privileges:true]\n    restart: unless-stopped')
compose.write_text(data)
template.write_bytes((source / 'public.conf.template').read_bytes())
env.write_text('\n'.join('PUBLIC_HOST=aeroquetzal.178.104.151.184.sslip.io' if line.startswith('PUBLIC_HOST=') else line for line in env.read_text().splitlines()) + '\n')
env.chmod(0o600)
print('Compose público preparado: network_mode none, dominio y certificados separados')
