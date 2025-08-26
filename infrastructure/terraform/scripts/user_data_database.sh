#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_USER:?DATABASE_USER must be set}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD must be set}"
DB_NAME="${DATABASE_NAME:-appdb}"

log() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }

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

log "Enabling and starting mongod (no auth yet)"
systemctl enable mongod
systemctl start mongod

log "Waiting for mongod to become ready"
for i in $(seq 1 60); do
  if mongosh --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; then
    log "mongod is ready"
    break
  fi
  sleep 1
  [[ $i -eq 60 ]] && { log "mongod did not become ready in time"; exit 1; }
done

log "Creating application database user '${DATABASE_USER}' on database '${DB_NAME}'"
mongosh --quiet <<MONGO
use ${DB_NAME}
db.createUser({
  user: "${DATABASE_USER}",
  pwd: "${DATABASE_PASSWORD}",
  roles: [ { role: "readWrite", db: "${DB_NAME}" } ]
})
MONGO

log "Updating /etc/mongod.conf to enable authorization and listen on all interfaces"
# Enable authorization
if grep -qE '^\s*authorization\s*:' /etc/mongod.conf; then
  sed -i 's/^\(\s*authorization\s*:\s*\).*/\1"enabled"/' /etc/mongod.conf
else
  if ! grep -qE '^\s*security\s*:' /etc/mongod.conf; then
    printf "\nsecurity:\n  authorization: \"enabled\"\n" >> /etc/mongod.conf
  else
    awk '
      BEGIN{added=0}
      /^security\s*:/ {print; getline; if($0 !~ /authorization/){print "  authorization: \"enabled\""; added=1} else {print} next}
      {print}
    ' /etc/mongod.conf > /etc/mongod.conf.new && mv /etc/mongod.conf.new /etc/mongod.conf
  fi
fi

# Bind to all interfaces
if grep -qE '^\s*bindIp\s*:' /etc/mongod.conf; then
  sed -i 's/^\(\s*bindIp\s*:\s*\).*/\10.0.0.0/' /etc/mongod.conf
else
  if ! grep -qE '^\s*net\s*:' /etc/mongod.conf; then
    printf "\nnet:\n  bindIp: 0.0.0.0\n" >> /etc/mongod.conf
  else
    awk '
      BEGIN{done=0}
      /^net\s*:/ {print; getline; if($0 !~ /bindIp/){print "  bindIp: 0.0.0.0"; done=1} else {print} next}
      {print}
    ' /etc/mongod.conf > /etc/mongod.conf.new && mv /etc/mongod.conf.new /etc/mongod.conf
  fi
fi

log "Restarting mongod to apply changes"
systemctl restart mongod

log "Verifying authentication with application user"
mongosh --quiet "mongodb://127.0.0.1:27017/${DB_NAME}" -u "${DATABASE_USER}" -p "${DATABASE_PASSWORD}" --eval 'db.runCommand({connectionStatus:1})' >/dev/null

log "MongoDB setup complete"
