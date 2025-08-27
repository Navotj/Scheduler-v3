# replace file (scripts/user_data_database.sh)
#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_USER:?DATABASE_USER must be set}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD must be set}"
DB_NAME="${DATABASE_NAME:-appdb}"

log() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }

is_auth_enabled() {
  # Return 0 if /etc/mongod.conf has security.authorization: "enabled"
  grep -qE '^\s*security\s*:' /etc/mongod.conf && grep -qE '^\s*authorization\s*:\s*"enabled"' /etc/mongod.conf
}

ensure_bind_all() {
  # Ensure ONLY net.bindIpAll: true is present (remove any bindIp lines).
  # Return 0 if changed, 1 if no change.
  local changed=1
  local conf="/etc/mongod.conf"

  # Remove any bindIp lines (override risk)
  if grep -qE '^\s*bindIp\s*:' "$conf"; then
    sed -i '/^\s*bindIp\s*:/d' "$conf"
    changed=0
  fi

  # Ensure bindIpAll: true exists (under net:)
  if grep -qE '^\s*bindIpAll\s*:\s*true' "$conf"; then
    : # already correct
  else
    if grep -qE '^\s*bindIpAll\s*:' "$conf"; then
      sed -i 's/^\(\s*bindIpAll\s*:\s*\).*/\1true/' "$conf"
      changed=0
    else
      if grep -qE '^\s*net\s*:' "$conf"; then
        awk '
          BEGIN{inserted=0}
          /^\s*net\s*:/ {
            print
            # Insert bindIpAll as first setting after net:
            getline
            if($0 !~ /^\s+/){ print "  bindIpAll: true"; inserted=1; print; next }
            else { print "  bindIpAll: true"; inserted=1 }
          }
          { print }
        ' "$conf" > "$conf.new" && mv "$conf.new" "$conf"
        changed=0
      else
        printf "\nnet:\n  bindIpAll: true\n" >> "$conf"
        changed=0
      fi
    fi
  fi

  return $changed
}

enable_auth_if_needed() {
  # Enable security.authorization: "enabled"; return 0 if changed, 1 if no change
  local changed=1
  local conf="/etc/mongod.conf"

  if grep -qE '^\s*authorization\s*:\s*"' "$conf"; then
    if ! grep -qE '^\s*authorization\s*:\s*"enabled"' "$conf"; then
      sed -i 's/^\(\s*authorization\s*:\s*\).*/\1"enabled"/' "$conf"
      changed=0
    fi
  else
    if grep -qE '^\s*security\s*:' "$conf"; then
      # Add authorization under existing security:
      awk '
        BEGIN{done=0}
        /^\s*security\s*:/ {print; print "  authorization: \"enabled\""; done=1; next}
        {print}
      ' "$conf" > "$conf.new" && mv "$conf.new" "$conf"
      changed=0
    else
      printf "\nsecurity:\n  authorization: \"enabled\"\n" >> "$conf"
      changed=0
    fi
  fi

  return $changed
}

mongo_ping_noauth() {
  mongosh --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1
}

mongo_ping_auth() {
  # Authenticate against the admin database explicitly
  mongosh --quiet "mongodb://127.0.0.1:27017/admin?authSource=admin" \
    -u "${DATABASE_USER}" -p "${DATABASE_PASSWORD}" \
    --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1
}

wait_for_mongo() {
  # Wait until mongod responds either without auth OR with auth (handles idempotent reruns)
  for i in $(seq 1 60); do
    if mongo_ping_noauth || mongo_ping_auth; then
      log "mongod is ready"
      return 0
    fi
    sleep 1
  done
  log "mongod did not become ready in time"
  return 1
}

# ---------- Prepare dedicated data volume at /var/lib/mongo ----------
# Supports Nitro (/dev/nvme1n1) and Xen-style (/dev/xvdf).
DATA_DEV=""
for cand in /dev/xvdf /dev/nvme1n1; do
  if [[ -b "$cand" ]]; then DATA_DEV="$cand"; break; fi
done

if [[ -n "${DATA_DEV}" ]]; then
  log "Detected data device: ${DATA_DEV}"
  if ! blkid "${DATA_DEV}" >/dev/null 2>&1; then
    log "Formatting ${DATA_DEV} as XFS"
    mkfs.xfs -f "${DATA_DEV}"
  fi
  install -d -m 0755 /var/lib/mongo
  UUID="$(blkid -s UUID -o value "${DATA_DEV}")"
  if ! grep -q "${UUID}" /etc/fstab; then
    echo "UUID=${UUID} /var/lib/mongo xfs defaults,nofail 0 2" >> /etc/fstab
  fi
  log "Mounting data volume to /var/lib/mongo"
  mount -a || true
fi

log "Updating package index"
dnf clean all -y
dnf makecache -y

log "Configuring MongoDB 8.0 repository"
cat >/etc/yum.repos.d/mongodb-org-8.0.repo <<'EOF'
[mongodb-org-8.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/amazon/2023/mongodb-org/8.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-8.0.asc
EOF

log "Installing MongoDB"
dnf install -y mongodb-org

log "Ensuring data directory exists and is owned by mongod"
install -d -m 0755 /var/lib/mongo
chown -R mongod:mongod /var/lib/mongo

# --------- Start or ensure mongod running ----------
if ! systemctl is-active --quiet mongod; then
  log "Enabling and starting mongod"
  systemctl enable mongod
  systemctl start mongod
fi

log "Waiting for mongod to become ready"
wait_for_mongo || exit 1

# --------- Idempotent user + auth configuration ----------
if ! is_auth_enabled; then
  log "Auth NOT enabled yet; creating user unauthenticated, then enabling auth"
  log "Creating application user '${DATABASE_USER}' in admin with readWrite on '${DB_NAME}'"
  mongosh --quiet <<MONGO
use admin
if (db.getUser("${DATABASE_USER}")) {
  if ("${ROTATE_DB_PASSWORD:-0}" === "1") {
    db.updateUser("${DATABASE_USER}", { pwd: "${DATABASE_PASSWORD}" });
    print("Updated existing user password (admin)");
  } else {
    print("User already exists in admin; skipping password change");
  }
} else {
  db.createUser({
    user: "${DATABASE_USER}",
    pwd: "${DATABASE_PASSWORD}",
    roles: [ { role: "readWrite", db: "${DB_NAME}" } ]
  });
  print("Created user in admin with readWrite on ${DB_NAME}");
}
MONGO

  # Apply config changes (auth + bind) and restart if any changed
  need_restart=0
  if enable_auth_if_needed; then need_restart=1; fi
  if ensure_bind_all; then need_restart=1; fi

  if [[ ${need_restart} -eq 1 ]]; then
    log "Restarting mongod to apply auth/bind changes"
    systemctl restart mongod
    log "Waiting for mongod to become ready after restart"
    wait_for_mongo || exit 1
  else
    log "No mongod.conf changes required"
  fi
else
  log "Auth already enabled; verifying supplied credentials (authSource=admin)"
  if mongo_ping_auth; then
    log "Credentials valid; user exists in admin. Skipping create."
    if [[ "${ROTATE_DB_PASSWORD:-0}" == "1" ]]; then
      log "ROTATE_DB_PASSWORD=1 set; updating user password in admin"
      mongosh --quiet "mongodb://127.0.0.1:27017/admin?authSource=admin" \
        -u "${DATABASE_USER}" -p "${DATABASE_PASSWORD}" --eval '
          db.updateUser("'"${DATABASE_USER}"'", { pwd: "'"${DATABASE_PASSWORD}"'" });
        ' >/dev/null
    fi
  else
    log "WARNING: Unable to authenticate with provided credentials; leaving users unchanged"
  fi

  # Ensure bindAll and restart only if config changed
  need_restart=0
  if ensure_bind_all; then need_restart=1; fi

  if [[ ${need_restart} -eq 1 ]]; then
    log "bindIp updated; restarting mongod"
    systemctl restart mongod
    log "Waiting for mongod to become ready after restart"
    wait_for_mongo || exit 1
  else
    log "bindIp already correct; no restart needed"
  fi
fi

log "MongoDB setup complete"
