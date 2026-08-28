#!/usr/bin/env bash
set -euo pipefail

# Bootstrap TUFF Stats on a fresh Ubuntu Lightsail instance (1 GB plan).

REPO_DIR="${REPO_DIR:-/opt/tuff-stats}"
REPO_URL="${REPO_URL:-https://github.com/AshleyStreet/tuff-stats-mvp.git}"
BRANCH="${BRANCH:-main}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (sudo -i) so Docker can be installed." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if [[ ! -d "${REPO_DIR}/.git" ]]; then
  git clone --branch "${BRANCH}" "${REPO_URL}" "${REPO_DIR}"
else
  git -C "${REPO_DIR}" fetch origin
  git -C "${REPO_DIR}" checkout "${BRANCH}"
  git -C "${REPO_DIR}" pull --ff-only origin "${BRANCH}"
fi

cd "${REPO_DIR}"
mkdir -p deploy/lightsail
if [[ ! -f deploy/lightsail/.env ]]; then
  cp deploy/lightsail/env.example deploy/lightsail/.env
  echo "Created deploy/lightsail/.env — set ADMIN_TOKEN (and later DOMAIN) before going public."
fi

docker compose --env-file deploy/lightsail/.env up -d --build

echo
echo "TUFF Stats is starting behind Caddy."
echo "  curl -sS http://127.0.0.1/api/health"
echo "Until DNS is set, use http://<static-ip>/  (no .onrender.com)."
echo "Then uncomment DOMAIN=stats.playtuff.ca in deploy/lightsail/.env and: docker compose --env-file deploy/lightsail/.env up -d"
