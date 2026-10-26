#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL no está definida" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump no está instalado" >&2
  exit 1
fi

backup_dir="${BACKUP_DIR:-$(pwd)/database/backups}"
mkdir -p "$backup_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$backup_dir/aeroquetzal-$timestamp.dump"

pg_dump --format=custom --no-owner --no-privileges --file="$output" "$DATABASE_URL"
test -s "$output"

echo "Respaldo creado en $output"
