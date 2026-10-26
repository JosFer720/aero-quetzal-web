#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL no está definida" >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore no está instalado" >&2
  exit 1
fi

if [[ $# -ne 2 || "$1" != "--confirm" ]]; then
  echo "Uso: $0 --confirm RUTA_DEL_RESPALDO" >&2
  exit 1
fi

backup_file="$2"
if [[ ! -f "$backup_file" ]]; then
  echo "No existe el respaldo: $backup_file" >&2
  exit 1
fi

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --dbname="$DATABASE_URL" \
  "$backup_file"

echo "Restauración completada"
