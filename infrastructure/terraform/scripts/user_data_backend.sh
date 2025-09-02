#!/usr/bin/env bash
set -euo pipefail

log() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }

# ===== Required inputs from Terraform templatefile =====
: "${DATABASE_USER:?DATABASE_USER not set}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD not set}"
: "${DATABASE_NAME:?DATABASE_NAME not set}"
: "${DATABASE_HOST:?DATABASE_HOST not set (private IP/hostname of MongoDB instance)}"
: "${ROOT_DOMAIN:?ROOT_DOMAIN not set}"
# Optional (will be generated if not provided)
: "${JWT_SECRET:=}"

# Optional OAuth credentials (pass through from Terraform if you have them)
: "${OAUTH_GOOGLE_CLIENT_ID:=}"
: "${OAUTH_GOOGLE_CLIENT_SECRET:=}"
: "${OAUTH_GITHUB_CLIENT_ID:=}"
: "${OAUTH_GITHUB_CLIENT_SECRET:=}"
: "${OAUTH_DISCORD_CLIENT_ID:=}"
: "${OAUTH_DISCORD_CLIENT_SECRET:=}"

APP_DIR="/opt/app"
FRONTEND_URL="https://www.${ROOT_DOMAIN}"
API_URL="https://api.${ROOT_DOMAIN}"

log "Update packages"
dnf -y makecache

log "Install Node.js 22 (Nodesource) and npm"
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf -y install nodejs

log "Create application directory ${APP_DIR}"
install -d -m 0755 "${APP_DIR}"
chown ec2-user:ec2-user "${APP_DIR}"

# Generate JWT secret if not provided
if [[ -z "${JWT_SECRET}" ]]; then
  JWT_SECRET="$(openssl rand -hex 32)"
  log "Generated random JWT_SECRET"
fi

log "Write /opt/app/.env (overwrite)"
cat > "${APP_DIR}/.env" <<ENV
MONGO_URI=mongodb://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:27017/${DATABASE_NAME}?authSource=admin
JWT_SECRET=${JWT_SECRET}

PUBLIC_FRONTEND_URL=${FRONTEND_URL}
PUBLIC_API_URL=${API_URL}
COOKIE_DOMAIN=.${ROOT_DOMAIN}
COOKIE_SECURE=true
# OAuth callbacks must land on the API host
OAUTH_CALLBACK_ORIGIN=${API_URL}

# OAuth provider credentials
OAUTH_GOOGLE_CLIENT_ID=${OAUTH_GOOGLE_CLIENT_ID}
OAUTH_GOOGLE_CLIENT_SECRET=${OAUTH_GOOGLE_CLIENT_SECRET}
OAUTH_GITHUB_CLIENT_ID=${OAUTH_GITHUB_CLIENT_ID}
OAUTH_GITHUB_CLIENT_SECRET=${OAUTH_GITHUB_CLIENT_SECRET}
OAUTH_DISCORD_CLIENT_ID=${OAUTH_DISCORD_CLIENT_ID}
OAUTH_DISCORD_CLIENT_SECRET=${OAUTH_DISCORD_CLIENT_SECRET}
ENV

chmod 0600 "${APP_DIR}/.env"
chown ec2-user:ec2-user "${APP_DIR}/.env"

log "Backend user-data bootstrap complete"

#adding a comment to force a recreate.