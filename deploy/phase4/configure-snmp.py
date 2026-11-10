#!/usr/bin/env python3
"""Run as root after installing Ubuntu snmp/snmpd. No secrets are printed."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

role = sys.argv[1]
assert role in {"edge", "core"}
root = Path("/root/aq-phase4-secrets")
root.mkdir(mode=0o700, exist_ok=True)
os.chmod(root, 0o700)
if role == "edge":
    for target in ("edge", "core"):
        path = root / (target + ".json")
        if not path.exists():
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as file:
                json.dump({"auth": secrets.token_hex(24), "priv": secrets.token_hex(24)}, file)

credential = json.loads((root / (role + ".json")).read_text())
address = "172.20.0.2" if role == "edge" else "10.10.0.49"
marker = Path("/etc/snmp/.aeroquetzal-v3-configured")
if not marker.exists():
    subprocess.run(["systemctl", "stop", "snmpd"], check=True)
    persistent = Path("/var/lib/snmp/snmpd.conf")
    persistent.parent.mkdir(exist_ok=True)
    with persistent.open("a") as file:
        file.write(f'\ncreateUser aqmonitor SHA-256 "{credential["auth"]}" AES "{credential["priv"]}"\n')
    os.chmod(persistent, 0o600)
    subprocess.run(["chown", "Debian-snmp:Debian-snmp", str(persistent)], check=True)
    config = Path("/etc/snmp/snmpd.conf")
    if config.exists():
        backup = Path("/etc/snmp/snmpd.conf.before-aeroquetzal")
        if not backup.exists():
            backup.write_bytes(config.read_bytes())
            os.chmod(backup, 0o600)
    config.write_text(f'''agentaddress udp:{address}:161
sysLocation AeroQuetzal {role}
sysContact TI AeroQuetzal
view aqRead included .1.3.6.1.2.1
view aqRead included .1.3.6.1.4.1.2021
rouser aqmonitor priv -V aqRead
dontLogTCPWrappersConnects yes
''')
    os.chmod(config, 0o640)
    subprocess.run(["chown", "root:Debian-snmp", str(config)], check=True)
    marker.touch(mode=0o600)
subprocess.run(["systemctl", "enable", "--now", "snmpd"], check=True)

if role == "core":
    for target in ("edge", "core"):
        item = json.loads((root / (target + ".json")).read_text())
        directory = Path("/etc/aeroquetzal/snmp") / target
        directory.mkdir(parents=True, mode=0o700, exist_ok=True)
        os.chmod(directory, 0o700)
        config = directory / "snmp.conf"
        config.write_text(f'''defVersion 3
defSecurityName aqmonitor
defSecurityLevel authPriv
defAuthType SHA-256
defPrivType AES
defAuthPassphrase {item["auth"]}
defPrivPassphrase {item["priv"]}
''')
        os.chmod(config, 0o600)
print(f"SNMPv3 authPriv configurado en {role}; sólo lectura, credenciales protegidas")
