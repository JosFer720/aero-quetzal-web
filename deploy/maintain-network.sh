#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
while true; do
  if docker inspect -f '{{.State.Running}}' aq-postgres 2>/dev/null | grep -q true; then
    ./attach-network.sh core || true
  fi
  if docker inspect -f '{{.State.Running}}' aq-internal-web 2>/dev/null | grep -q true; then
    ./attach-network.sh internal || true
  fi
  sleep 5
done
