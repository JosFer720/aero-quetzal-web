#!/usr/bin/env bash
# Only for edge-vpn when Docker is absent. Uses Docker's signed Ubuntu repository.
set -euo pipefail
[[ $EUID -eq 0 ]] || exit 1
if command -v docker >/dev/null; then docker version; exit 0; fi
install -d -m 0755 /etc/docker /etc/apt/keyrings
[[ ! -e /etc/docker/daemon.json ]] || { echo 'Revisar daemon.json existente' >&2; exit 1; }
cat > /etc/docker/daemon.json <<'EOF'
{"iptables":false,"ip6tables":false,"bridge":"none"}
EOF
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod 0644 /etc/apt/keyrings/docker.asc
. /etc/os-release
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker version
