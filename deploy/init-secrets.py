#!/usr/bin/env python3
"""Generate NEW secrets outside Git. Existing files are never overwritten; no values are printed."""
import argparse
import os
from pathlib import Path
import secrets

parser = argparse.ArgumentParser()
parser.add_argument("--public-host", required=True)
args = parser.parse_args()
if not args.public_host or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-" for char in args.public_host):
    parser.error("Host público inválido")
directory = Path(__file__).resolve().parent / "secrets"
directory.mkdir(mode=0o700, exist_ok=True)
if any(directory.iterdir()):
    raise SystemExit("El directorio de secretos ya contiene archivos; no se reemplaza ninguna credencial")
password, session, token = (secrets.token_hex(32) for _ in range(3))
files = {
    "postgres_password": password + "\n",
    "business.env": f"DATABASE_URL=postgresql://aeroquetzal:{password}@10.10.0.104:5432/aeroquetzal\nPUBLIC_GATEWAY_TOKEN={token}\n",
    "auth.env": f"SESSION_SECRET={session}\nAUTH_ORIGIN=https://intranet.aeroquetzal.internal\nLDAP_URL=ldaps://ldap.aeroquetzal.internal:636\n",
    "public.env": f"PUBLIC_HOST={args.public_host}\nBUSINESS_UPSTREAM=10.10.0.103:8080\nPUBLIC_GATEWAY_TOKEN={token}\n",
}
for name, value in files.items():
    with os.fdopen(os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as output:
        output.write(value)
print("Secretos nuevos creados en deploy/secrets; copie sólo los necesarios a cada servidor.")
