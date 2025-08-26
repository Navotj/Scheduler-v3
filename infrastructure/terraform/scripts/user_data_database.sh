#!/usr/bin/env bash
set -euo pipefail

# Expect these to be injected by your CI (GitHub Actions) at deploy time.
: "${DATABASE_USER:?DATABASE_USER must be set (from GitHub secret database_user)}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD must be set (from GitHub secret database_password)}"
DB_NAME="${DATABASE_NAME:-appdb}"

log() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }

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

log "Enabling and starting mongod (no auth yet)"
systemctl enable mongod
systemctl start mongod

# Wait for mongod to accept connections
log "Waiting for mongod to become ready"
for i in {1..60}; do
  if mongosh --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; then
    log "mongod is ready"
    break
  fi
  sleep 1
  if [[ $i -eq 60 ]]; then
    log "mongod did not become ready in time"; exit 1
  fi
done

log "Creating application database user '${DATABASE_USER}' on database '${DB_NAME}'"
# Create the application user BEFORE enabling authorization.
mongosh --quiet <<MONGO
use ${DB_NAME}
db.createUser({
  user: "${DATABASE_USER}",
  pwd: "${DATABASE_PASSWORD}",
  roles: [
    { role: "readWrite", db: "${DB_NAME}" }
  ]
})
MONGO

# Enable authorization and listen on all interfaces (access controlled by Security Groups).
# 1) Enable security.authorization: enabled
# 2) Set net.bindIp: 0.0.0.0 (so backend in VPC can connect; restrict via SG)
log "Updating /etc/mongod.conf to enable authorization and listen on all interfaces"
# Enable authorization (add if missing, change if present)
if grep -qE '^\s*authorization\s*:\s*' /etc/mongod.conf; then
  sed -i 's/^\(\s*authorization\s*:\s*\).*/\1"enabled"/' /etc/mongod.conf
else
  # Ensure 'security:' section exists; if not, append it.
  if ! grep -qE '^\s*security\s*:' /etc/mongod.conf; then
    printf "\nsecurity:\n  authorization: \"enabled\"\n" >> /etc/mongod.conf
  else
    # Append authorization under existing security section
    awk '
      BEGIN{added=0}
      /^security\s*:/ {print; getline; if($0 !~ /authorization/){print "  authorization: \"enabled\""; added=1} else {print} next}
      {print}
      END{if(added==0){}}
    ' /etc/mongod.conf > /etc/mongod.conf.new && mv /etc/mongod.conf.new /etc/mongod.conf
  fi
fi

# Bind to all interfaces (so the backend instance can reach it)
if grep -qE '^\s*bindIp\s*:' /etc/mongod.conf; then
  sed -i 's/^\(\s*bindIp\s*:\s*\).*/\10.0.0.0/' /etc/mongod.conf
else
  # Ensure 'net:' section exists; if not, append it.
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

log "Restarting mongod to apply authorization and bindIp changes"
systemctl restart mongod

# Verify we can authenticate with the application user (auth now enabled)
log "Verifying authentication with application user"
mongosh --quiet "mongodb://127.0.0.1:27017/${DB_NAME}" -u "${DATABASE_USER}" -p "${DATABASE_PASSWORD}" --eval 'db.runCommand({connectionStatus:1})' >/dev/null

log "MongoDB setup complete: user created and authorization enabled"
