#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "$(git status --porcelain)" && "${ALLOW_DIRTY:-0}" != 1 ]]; then
  echo 'Guardar el commit validado antes de construir una release; ALLOW_DIRTY=1 sólo para pruebas locales.' >&2
  exit 1
fi
release="${RELEASE:-$(git rev-parse --short=12 HEAD)}"
[[ "$release" =~ ^[a-zA-Z0-9_.-]+$ ]] || exit 1
for target in build runtime public-web internal-web; do
  name="$target"
  [[ "$target" != runtime ]] || name=server
  [[ "$target" != build ]] || name=migrate
  docker build --network host --platform linux/amd64 --target "$target" -f deploy/Dockerfile -t "aeroquetzal/$name:$release" .
done
mkdir -p deploy/artifacts
docker pull --platform linux/amd64 postgres:18-alpine
docker save "aeroquetzal/migrate:$release" "aeroquetzal/server:$release" "aeroquetzal/public-web:$release" "aeroquetzal/internal-web:$release" postgres:18-alpine | gzip > "deploy/artifacts/images-$release.tar.gz"
echo "Imágenes exportadas: deploy/artifacts/images-$release.tar.gz"
