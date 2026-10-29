#!/usr/bin/env bash
# Run from the checked-out release on the target host after reviewed network/ACL/TLS prerequisites.
set -euo pipefail
cd "$(dirname "$0")"
[[ $EUID -eq 0 ]] || { echo 'Ejecutar con sudo' >&2; exit 1; }
[[ "${RELEASE:-}" =~ ^[a-zA-Z0-9_.-]+$ ]] || { echo 'Configurar RELEASE' >&2; exit 1; }
case "${1:-}" in
  core)
    [[ -s secrets/business.env && -s secrets/auth.env && -s secrets/ldap-ca.pem ]] || exit 1
    docker compose -f docker-compose.yml config --quiet
    docker compose -f docker-compose.yml up -d
    ./attach-network.sh core
    database_ready=0
    for attempt in $(seq 1 30); do
      if docker exec aq-postgres pg_isready -h 127.0.0.1 -U aeroquetzal -d aeroquetzal; then database_ready=1; break; fi
      sleep 2
    done
    [[ "$database_ready" == 1 ]] || { echo 'PostgreSQL no está disponible' >&2; exit 1; }
    docker run --rm --network container:aq-business-api --env-file secrets/business.env \
      "aeroquetzal/migrate:$RELEASE" npm run prisma:migrate:deploy --workspace @aeroquetzal/database
    # Seed is explicit: rerunning a release does not silently rewrite catalog data.
    if [[ "${SEED_DATABASE:-0}" == 1 ]]; then
      docker run --rm --network container:aq-business-api --env-file secrets/business.env \
        -e SEED_BASE_DATE="${SEED_BASE_DATE:?set a current seed date}" \
        "aeroquetzal/migrate:$RELEASE" npm run db:seed
    fi
    install -d /usr/local/lib/aeroquetzal-web
    install -m 0755 attach-network.sh maintain-network.sh /usr/local/lib/aeroquetzal-web/
    install -m 0644 aeroquetzal-web-network.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable --now aeroquetzal-web-network.service
    for attempt in $(seq 1 30); do
      if docker exec aq-business-api node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then exit 0; fi
      sleep 2
    done
    echo 'La API no alcanzó un estado saludable' >&2; exit 1
    ;;
  public)
    [[ -s secrets/public.env && -s secrets/public-tls/fullchain.pem && -s secrets/public-tls/privkey.pem ]] || exit 1
    docker compose -f public/docker-compose.yml config --quiet
    docker compose -f public/docker-compose.yml run --rm --no-deps public-web nginx -t
    docker compose -f public/docker-compose.yml up -d
    ;;
  internal)
    [[ -s secrets/internal-tls/fullchain.pem && -s secrets/internal-tls/privkey.pem ]] || exit 1
    # The old .116 container must already be stopped and its veth retired by its owning service.
    if docker inspect -f '{{.State.Running}}' intranet 2>/dev/null | grep -q true; then
      echo 'La intranet anterior sigue activa. Respaldar y retirar sólo esa web antes del cambio.' >&2; exit 1
    fi
    docker compose -f internal/docker-compose.yml config --quiet
    docker compose -f internal/docker-compose.yml run --rm --no-deps internal-web nginx -t
    docker compose -f internal/docker-compose.yml up -d
    ./attach-network.sh internal
    ;;
  *) echo 'Uso: RELEASE=<commit> release.sh core|public|internal' >&2; exit 1 ;;
esac
