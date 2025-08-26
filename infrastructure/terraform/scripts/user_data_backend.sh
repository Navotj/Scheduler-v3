#!/usr/bin/env bash
set -euo pipefail
log() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }

# Required env from wrapper/templatefile:
: "${DATABASE_USER:?DATABASE_USER not set}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD not set}"
: "${DATABASE_NAME:?DATABASE_NAME not set}"
: "${DATABASE_HOST:?DATABASE_HOST not set (pass private IP/hostname of MongoDB instance)}"

APP_DIR="/opt/app"

log "Update packages"
dnf -y makecache

log "Install Node.js and npm (from Amazon Linux repos)"
dnf -y install nodejs npm

log "Create application directory ${APP_DIR}"
install -d -m 0755 "${APP_DIR}"
chown ec2-user:ec2-user "${APP_DIR}"

log "Write .env with Mongo connection string"
cat > "${APP_DIR}/.env" <<ENV
MONGO_URI=mongodb://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:27017/${DATABASE_NAME}?authSource=${DATABASE_NAME}
ENV
chmod 0600 "${APP_DIR}/.env"
chown ec2-user:ec2-user "${APP_DIR}/.env"

log "Backend bootstrap complete"
