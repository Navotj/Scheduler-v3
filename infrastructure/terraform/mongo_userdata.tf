locals {
  mongo_user_data = <<-EOT
    #!/usr/bin/env bash
    set -euxo pipefail
    exec > >(tee -a /var/log/user_data-mongo.log) 2>&1

    echo "== Detect package manager =="
    PKG="dnf"; command -v dnf >/dev/null 2>&1 || PKG="yum"

    echo "== Base updates =="
    if [ "$PKG" = "dnf" ]; then dnf -y update || true; else yum -y update || true; fi

    echo "== Tools =="
    command -v curl >/dev/null 2>&1 || $PKG -y install curl
    command -v gpg2  >/dev/null 2>&1 || $PKG -y install gnupg2
    $PKG -y install awscli xfsprogs || true

    echo "== MongoDB 8.0 repo =="
    install -d -m 0755 /etc/pki/rpm-gpg
    curl -fsSL https://pgp.mongodb.com/server-8.0.asc | gpg2 --dearmor -o /etc/pki/rpm-gpg/mongodb-org-8.0.gpg
    cat >/etc/yum.repos.d/mongodb-org-8.0.repo <<'REPO'
    [mongodb-org-8.0]
    name=MongoDB Repository
    baseurl=https://repo.mongodb.org/yum/amazon/2023/mongodb-org/8.0/x86_64/
    gpgcheck=1
    enabled=1
    gpgkey=file:///etc/pki/rpm-gpg/mongodb-org-8.0.gpg
    REPO

    echo "== Install MongoDB (server + mongosh) =="
    $PKG -y install mongodb-org mongodb-mongosh || $PKG -y install mongodb-org

    echo "== Find attached data device (wait up to 120s) =="
    DEVICE=""
    for i in $(seq 1 120); do
      if   [ -e /dev/xvdf ]; then DEVICE=/dev/xvdf
      elif [ -e /dev/nvme1n1 ]; then DEVICE=/dev/nvme1n1
      fi
      [ -n "$DEVICE" ] && break
      sleep 1
    done
    if [ -z "$DEVICE" ]; then
      for d in $(lsblk -ndo NAME,TYPE | awk '$2=="disk"{print "/dev/"$1}'); do
        if lsblk -nro MOUNTPOINT "$d" | grep -q '/'; then continue; fi
        DEVICE="$d"; break
      done
    fi
    [ -n "$DEVICE" ] || { echo "FATAL: No data EBS device found" >&2; exit 1; }
    echo "Using data device: $DEVICE"

    echo "== Format XFS if needed =="
    if ! blkid "$DEVICE" >/dev/null 2>&1; then mkfs.xfs -f "$DEVICE"; fi

    echo "== Mount /data/db via UUID =="
    UUID=$(blkid -s UUID -o value "$DEVICE")
    MOUNT_POINT="/data/db"
    mkdir -p "$MOUNT_POINT"
    grep -qs "$MOUNT_POINT" /etc/fstab || echo "UUID=$UUID $MOUNT_POINT xfs defaults,nofail 0 2" >> /etc/fstab
    mount "$MOUNT_POINT" || mount -a || true
    chown -R mongod:mongod "$MOUNT_POINT"

    echo "== Write minimal mongod.conf (no auth yet) =="
    CONF="/etc/mongod.conf"
    cp -an "$CONF" "$CONF.bak.$(date +%s)" || true
    cat >"$CONF" <<'CFG'
    storage:
      dbPath: /data/db
    net:
      bindIp: 0.0.0.0
      port: 27017
    # security will be enabled after admin user is created
    CFG

    echo "== Enable & start mongod (open, no auth) =="
    systemctl daemon-reload || true
    systemctl enable mongod
    systemctl restart mongod || systemctl start mongod

    echo "== Wait for mongod to listen on 27017 =="
    for i in $(seq 1 90); do
      if ss -lntp | grep -q ':27017'; then break; fi
      sleep 1
    done

    echo "== Fetch SSM admin creds and create user =="
    set +x  # hide secrets
    TOKEN=$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
    AWS_REGION_CMD=$(
      curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" \
        http://169.254.169.254/latest/dynamic/instance-identity/document \
      | sed -n 's/.*"region"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
    )
    AWS_REGION="$AWS_REGION_CMD"
    if [ -z "$AWS_REGION" ]; then AWS_REGION="eu-central-1"; fi

    SSM_USER_PARAM="/nat20/mongo/USER"
    SSM_PASS_PARAM="/nat20/mongo/PASSWORD"

    MONGO_USER=""; MONGO_PASS=""
    for i in $(seq 1 150); do
      MONGO_USER=$(aws ssm get-parameter --name "$SSM_USER_PARAM" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || true)
      MONGO_PASS=$(aws ssm get-parameter --name "$SSM_PASS_PARAM" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || true)
      if [ -n "$MONGO_USER" ] && [ "$MONGO_USER" != "None" ] && [ -n "$MONGO_PASS" ] && [ "$MONGO_PASS" != "None" ]; then break; fi
      sleep 2
    done
    set -x

    if [ -z "$MONGO_USER" ] || [ -z "$MONGO_PASS" ] || [ "$MONGO_USER" = "None" ] || [ "$MONGO_PASS" = "None" ]; then
      echo "FATAL: Missing SSM parameters ($SSM_USER_PARAM / $SSM_PASS_PARAM); refusing to enable auth with no admin." >&2
      exit 1
    fi

    umask 077
    cat >/root/create_admin.js <<'JS'
    const user = (process.env.MONGO_USER || "").trim();
    const pass = (process.env.MONGO_PASS || "").trim();
    if (!user || !pass) { throw new Error("Missing MONGO_USER or MONGO_PASS"); }
    const admin = db.getSiblingDB("admin");
    const existing = admin.system.users.findOne({ user, db: "admin" });
    if (existing) {
      print("User '" + user + "' already exists; skipping.");
    } else {
      admin.createUser({ user, pwd: pass, roles: [ { role: "root", db: "admin" } ] });
      print("Created admin user '" + user + "'.");
    }
    JS
    MONGO_USER="$MONGO_USER" MONGO_PASS="$MONGO_PASS" mongosh --quiet --file /root/create_admin.js >/root/mongo_user_setup.log 2>&1 || true
    shred -u /root/create_admin.js
    unset MONGO_PASS

    echo "== Enable authorization and restart =="
    if grep -qE '^[[:space:]]*security:' "$CONF"; then
      if ! grep -qE '^[[:space:]]*authorization:[[:space:]]*enabled' "$CONF"; then
        sed -ri '/^[[:space:]]*security:/a\\  authorization: enabled' "$CONF"
      fi
    else
      cat >>"$CONF" <<'SEC'
    security:
      authorization: enabled
    SEC
    fi

    systemctl restart mongod

    echo "== Done. Quick health =="
    systemctl is-active mongod || true
    ss -lntp | grep ':27017' || tr
