#!/usr/bin/env python3
"""Validate all Compose models using disposable, explicitly fake environment files."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

source = Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix="aq-compose-test-") as temporary:
    root = Path(temporary)
    for name in ["docker-compose.yml", "public/docker-compose.yml", "internal/docker-compose.yml"]:
        destination = root / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(source / name, destination)
    secrets = root / "secrets"
    secrets.mkdir()
    for name in ["auth.env", "business.env", "public.env"]:
        (secrets / name).write_text("FAKE_COMPOSE_VALIDATION_ONLY=1\n")
    (secrets / "postgres_password").write_text("fake-compose-test-only\n")
    for name in ["docker-compose.yml", "public/docker-compose.yml", "internal/docker-compose.yml"]:
        subprocess.run(["docker", "compose", "-f", str(root / name), "config", "--quiet"],
                       env={**os.environ, "RELEASE": "compose-validation-only"}, check=True)
print("Compose core, público e interno: modelos válidos.")
