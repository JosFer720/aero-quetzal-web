#!/usr/bin/env python3
"""Collect SNMP from the TI namespace; credentials never appear in argv/logs."""
import datetime
import json
import os
from pathlib import Path
import subprocess

pid = subprocess.check_output(["docker", "inspect", "-f", "{{.State.Pid}}", "ti01"], text=True).strip()
assert int(pid) > 0
oids = {
    "name": ".1.3.6.1.2.1.1.5.0",
    "uptime": ".1.3.6.1.2.1.1.3.0",
    "interfaces": ".1.3.6.1.2.1.2.1.0",
    "memory_total_kb": ".1.3.6.1.4.1.2021.4.5.0",
    "memory_available_kb": ".1.3.6.1.4.1.2021.4.6.0",
    "load_1min": ".1.3.6.1.4.1.2021.10.1.3.1",
}
result = {"timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(), "source": "TI 10.10.0.52", "targets": {}}
for target, address in (("edge", "172.20.0.2"), ("core", "10.10.0.49")):
    run = subprocess.run(["nsenter", "-t", pid, "-n", "/usr/bin/snmpget", "-On", "-t", "2", "-r", "1", "udp:" + address, *oids.values()],
                         env={**os.environ, "SNMPCONFPATH": "/etc/aeroquetzal/snmp/" + target, "MIBS": ""},
                         capture_output=True, text=True, timeout=25)
    result["targets"][target] = {"address": address, "ok": run.returncode == 0, "values": dict(zip(oids, run.stdout.strip().splitlines()))}
directory = Path("/var/lib/aeroquetzal-snmp")
directory.mkdir(mode=0o750, exist_ok=True)
temporary = directory / "latest.json.tmp"
temporary.write_text(json.dumps(result, indent=2) + "\n")
os.chmod(temporary, 0o640)
temporary.replace(directory / "latest.json")
print(json.dumps(result, indent=2))
if not all(item["ok"] for item in result["targets"].values()):
    raise SystemExit(1)
