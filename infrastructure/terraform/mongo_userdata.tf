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
    # log everything except secrets (we'll turn xtrace off before handling them)
    exec > >(tee -a /var/log/user_data-mongo.log) 2>&1

    echo "== Detect package manager =="
    PKG="dnf"
    command -v dnf >/dev/null 2>&1 || PKG="yum"

    echo "== Base updates =="
    if [ "$PKG" = "dnf" ]; then
    dnf -y update || true
    else
    yum -y update || true
    fi

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
    # fallback: first non-root disk without mounts
    for d in $(lsblk -ndo NAME,TYPE | awk '$2=="disk"{print "/dev/"$1}'); do
        if lsblk -nro MOUNTPOINT "$d" | grep -q '/'; then
        continue
        fi
        DEVICE="$d"
        break
    done
    fi

    if [ -z "$DEVICE" ]; then
    echo "FATAL: No data EBS device found" >&2
    exit 1
    fi
    echo "Using data device: $DEVICE"

    echo "== Format XFS if needed =="
    if ! blkid "$DEVICE" >/dev/null 2>&1; then
    mkfs.xfs -f "$DEVICE"
    fi

    echo "== Mount /data/db via UUID =="
    UUID=$(blkid -s UUID -o value "$DEVICE")
    MOUNT_POINT="/data/db"
    mkdir -p "$MOUNT_POINT"
    if ! grep -qs "$MOUNT_POINT" /etc/fstab; then
    echo "UUID=$UUID $MOUNT_POINT xfs defaults,nofail 0 2" >> /etc/fstab
    fi
    mount "$MOUNT_POINT" || mount -a || true
    chown -R mongod:mongod "$MOUNT_POINT"

    echo "== Configure mongod.conf (dbPath, bindIp) =="
    CONF="/etc/mongod.conf"
    test -f "$CONF" || { echo "mongod.conf missing after install" >&2; exit 1; }

    # storage.dbPath -> /data/db
    if grep -qE '^[[:space:]]*dbPath:' "$CONF"; then
    sed -ri 's/^[[:space:]]*dbPath:[[:space:]]*.*/  dbPath: \/data\/db/' "$CONF"
    else
    if grep -q '^storage:' "$CONF"; then
        awk '{print} /^storage:/{print "  dbPath: /data/db"}' "$CONF" | tee "$CONF.new" >/dev/null && mv "$CONF.new" "$CONF" || true
    else
        printf '\nstorage:\n  dbPath: /data/db\n' >> "$CONF"
    fi
    fi
    # net.bindIp -> 0.0
  EOT
}
