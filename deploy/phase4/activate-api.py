#!/usr/bin/env python3
"""Change only the API image after verifying the production backup and image exist."""
from pathlib import Path
import re
import subprocess

backup = Path('/root/aq-phase4-backup')
dump = backup / 'postgres-before-phase4.dump'
assert dump.stat().st_size > 100, 'Falta backup de producción'
image = 'aeroquetzal/server:phase4-1bcd216'
subprocess.run(['docker','image','inspect',image],stdout=subprocess.DEVNULL,check=True)
path = Path('/opt/aeroquetzal-web/deploy/docker-compose.yml')
old = path.read_text()
saved = backup / 'core-compose-before-phase4.yml'
if not saved.exists():
    saved.write_text(old)
    saved.chmod(0o600)
new, count = re.subn(r'(  business-api:\n(?:.*\n)*?    image: )[^\n]+',r'\g<1>'+image,old,count=1)
assert count == 1
path.write_text(new)
print('Actualizada únicamente la imagen de business-api')
