############################################################
# MongoDB 8.0 install via EC2 user_data (idempotent)
# - Installs MongoDB 8.0 on Amazon Linux 2023 (dnf/yum)
# - Mounts attached EBS at /data/db (XFS, by UUID; waits for the device)
# - Updates mongod.conf (dbPath=/data/db, bindIp=0.0.0.0)
# - Enables & starts mongod
# - Creates admin user from SSM params:
#       /nat20/mongo/USER and /nat20/mongo/PASSWORD
# - Enables authorization and restarts mongod
#
# Assumes in your stack:
# - aws_instance.mongodb exists
# - EBS volume + aws_volume_attachment.mongo_data_attachment exist
# - Instance profile already has SSM Parameter Store read perms
############################################################

locals {
  mongo_user_data = <<-EOT
    #!/usr/bin/env bash
    set -euxo pipefail
    exec > >(tee -a /var/log/user_data-mongo.log) 2>&1

    # --- package manager ---
    PKG="dnf"
    command -v dnf >/dev/null 2>&1 || PKG="yum"

    # --- base updates ---
    if [ "$PKG" = "dnf" ]; then
      dnf -y update || true
    else
      yum -y update || true
    fi

    # --- tools ---
    command -v curl >/dev/null 2>&1 || $PKG -y install curl
    command -v gpg2  >/dev/null 2>&1 || $PKG -y install gnupg2
    $PKG -y install awscli xfsprogs || true

    # --- mongodb repo ---
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

    # --- install mongodb ---
    $PKG -y install mongodb-org mongodb-mongosh || $PKG -y install mongodb-org

    # --- find attached data device (wait up to 120s) ---
    DEVICE=""
    for i in $(seq 1 120); do
      if   [ -e /dev/xvdf ]; then DEVICE=/dev/xvdf
      elif [ -e /dev/nvme1n1 ]; then DEVICE=/dev/nvme1n1
      fi
      [ -n "$DEVICE" ] && break
      sleep 1
    done

    if [ -z "$DEVICE" ]; then
      # fallback: pick first non-root disk without mounts
      for d in $(lsblk -ndo NAME,TYPE | awk '$2=="disk"{print "/dev/"$1}'); do
        if lsblk -nro MOUNTPOINT "$d" | grep -q '/'; then
          continue
        fi
        DEVICE="$d"
        break
      done
    fi

    if [ -z "$DEVICE" ]; then
      echo "No data EBS device found" >&2
      exit 1
    fi

    # --- format XFS if needed ---
    if ! blkid "$DEVICE" >/dev/null 2>&1; then
      mkfs.xfs -f "$DEVICE"
    fi

    # --- mount /data/db via UUID ---
    UUID=$(blkid -s UUID -o value "$DEVICE")
    MOUNT_POINT="/data/db"
    mkdir -p "$MOUNT_POINT"
    if ! grep -qs "$MOUNT_POINT" /etc/fstab; then
      echo "UUID=$UUID $MOUNT_POINT xfs defaults,nofail 0 2" >> /etc/fstab
    fi
    mount "$MOUNT_POINT" || mount -a || true
    chown -R mongod:mongod "$MOUNT_POINT"

    # --- configure mongod.conf ---
    CONF="/etc/mongod.conf"
    test -f "$CONF" || { echo "mongod.conf missing after install" >&2; exit 1; }

    # storage.dbPath -> /data/db
    if grep -qE '^[[:space:]]*dbPath:' "$CONF"; then
      sed -ri 's|^\\s*dbPath\\s*:\\s*.*|  dbPath: /data/db|' "$CONF"
    else
      awk '{print} /^storage:/{print "  dbPath: /data/db"}' "$CONF" | tee "$CONF.new" >/dev/null && mv "$CONF.new" "$CONF" || \
      printf '\\nstorage:\\n  dbPath: /data/db\\n' >> "$CONF"
    fi

    # net.bindIp -> 0.0.0.0
    if grep -qE '^[[:space:]]*bindIp:' "$CONF"; then
      sed -ri 's|^\\s*bindIp\\s*:\\s*.*|  bindIp: 0.0.0.0|' "$CONF"
    else
      awk '{print} /^net:/{print "  bindIp: 0.0.0.0"}' "$CONF" | tee "$CONF.new" >/dev/null && mv "$CONF.new" "$CONF" || \
      printf '\\nnet:\\n  bindIp: 0.0.0.0\\n' >> "$CONF"
    fi

    systemctl enable mongod
    systemctl restart mongod || systemctl start mongod

    # wait for port 27017
    for i in $(seq 1 60); do
      if ss -lntp | grep -q ':27017'; then break; fi
      sleep 1
    done

    # --- create admin user from SSM, then enable auth ---
    set +x
    TOKEN=$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
    AWS_REGION_CMD=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/dynamic/instance-identity/document | awk -F\\" '/"region":/ {print $4}')
    AWS_REGION="$AWS_REGION_CMD"
    if [ -z "$AWS_REGION" ]; then AWS_REGION="eu-central-1"; fi

    SSM_USER_PARAM="/nat20/mongo/USER"
    SSM_PASS_PARAM="/nat20/mongo/PASSWORD"
    MONGO_USER=$(aws ssm get-parameter --name "$SSM_USER_PARAM" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" || true)
    MONGO_PASS=$(aws ssm get-parameter --name "$SSM_PASS_PARAM" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" || true)
    set -x

    if [ -n "$MONGO_USER" ] && [ -n "$MONGO_PASS" ]; then
      cat >/tmp/create_admin.js <<'JS'
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
      MONGO_USER="$MONGO_USER" MONGO_PASS="$MONGO_PASS" mongosh --quiet --file /tmp/create_admin.js || true

      # enable authorization (idempotent)
      if grep -qE '^\\s*#\\s*security:' "$CONF"; then
        sed -ri 's/^\\s*#\\s*security:.*/security:\\n  authorization: enabled/' "$CONF"
      elif ! grep -qE '^\\s*security:' "$CONF"; then
        printf '\\nsecurity:\\n  authorization: enabled\\n' >> "$CONF"
      else
        if ! grep -qE '^\\s*authorization:\\s*enabled' "$CONF"; then
          sed -ri '/^\\s*security:/a\\  authorization: enabled' "$CONF"
        fi
      fi

      systemctl restart mongod
    else
      echo "WARNING: Missing /nat20/mongo/USER or /nat20/mongo/PASSWORD; user creation/auth enable skipped." >&2
    fi
  EOT
}
