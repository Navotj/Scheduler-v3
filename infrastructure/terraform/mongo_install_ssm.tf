############################################################
# MongoDB 8.0 install and configure via SSM (no user_data)
# - Installs MongoDB 8.0 on Amazon Linux 2023
# - Mounts attached EBS volume at /data/db (XFS)
# - Updates mongod.conf: dbPath=/data/db, bindIp=0.0.0.0
# - Creates admin user from SSM params /nat20/mongo/USER|PASSWORD
# - Enables authorization and restarts mongod
# - Targets EC2 with tag Name=terraform-mongodb
# - Depends on EBS volume attachment resource
############################################################

resource "aws_ssm_document" "mongo_install_8_0" {
  name          = "nat20-mongo-install-8-0"
  document_type = "Command"
  target_type   = "/AWS::EC2::Instance"

  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Install and configure MongoDB 8.0; mount EBS; create admin from SSM; enable auth."
    mainSteps = [
      {
        action = "aws:runShellScript"
        name   = "InstallMongo"
        inputs = {
          timeoutSeconds = "3600"
          runCommand = [<<-EOT
            #!/usr/bin/env bash
            set -euxo pipefail

            exec > >(tee -a /var/log/ssm-mongo-install.log) 2>&1

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
            $PKG -y install mongodb-org || $PKG -y install mongodb-org

            # --- detect data device ---
            DEVICE=""
            if [ -e /dev/xvdf ]; then
              DEVICE=/dev/xvdf
            elif [ -e /dev/nvme1n1 ]; then
              DEVICE=/dev/nvme1n1
            else
              for d in $(lsblk -ndo NAME,TYPE | awk '$2=="disk"{print "/dev/"$1}'); do
                # skip disks whose children are mounted (root disk)
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
            test -f "$CONF" || (echo "mongod.conf missing after install"; exit 1)

            # dbPath -> /data/db
            if grep -qE '^[[:space:]]*dbPath:' "$CONF"; then
              sed -ri 's|^\s*dbPath\s*:\s*.*|  dbPath: /data/db|' "$CONF"
            else
              awk '{print} /^storage:/{print "  dbPath: /data/db"}' "$CONF" | tee "$CONF.new" >/dev/null && mv "$CONF.new" "$CONF" || \
              printf '\nstorage:\n  dbPath: /data/db\n' >> "$CONF"
            fi

            # net.bindIp -> 0.0.0.0
            if grep -qE '^[[:space:]]*bindIp:' "$CONF"; then
              sed -ri 's|^\s*bindIp\s*:\s*.*|  bindIp: 0.0.0.0|' "$CONF"
            else
              awk '{print} /^net:/{print "  bindIp: 0.0.0.0"}' "$CONF" | tee "$CONF.new" >/dev/null && mv "$CONF.new" "$CONF" || \
              printf '\nnet:\n  bindIp: 0.0.0.0\n' >> "$CONF"
            fi

            systemctl enable mongod
            systemctl restart mongod || systemctl start mongod

            # wait for port 27017
            for i in $(seq 1 30); do
              if ss -lntp | grep -q ':27017'; then break; fi
              sleep 1
            done

            # --- create admin user from SSM, then enable auth ---
            set +x
            TOKEN=$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
            AWS_REGION=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/dynamic/instance-identity/document | awk -F\" '/"region":/ {print $4}')
            AWS_REGION=${AWS_REGION:-eu-central-1}

            SSM_USER_PARAM="/nat20/mongo/USER"
            SSM_PASS_PARAM="/nat20/mongo/PASSWORD"
            S3_MONGO_USER=$(aws ssm get-parameter --name "$SSM_USER_PARAM" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" || true)
            S3_MONGO_PASS=$(aws ssm get-parameter --name "$SSM_PASS_PARAM" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" || true)
            set -x

            if [ -z "${S3_MONGO_USER:-}" ] || [ -z "${S3_MONGO_PASS:-}" ]; then
              echo "Missing SSM creds; skipping user creation and auth enabling." >&2
            else
              cat >/tmp/create_app_user.js <<'JS'
              const user = (process.env.S3_MONGO_USER || "").trim();
              const pass = (process.env.S3_MONGO_PASS || "").trim();
              if (!user || !pass) { throw new Error("Missing S3_MONGO_USER or S3_MONGO_PASS"); }
              const admin = db.getSiblingDB("admin");
              const existing = admin.system.users.findOne({ user, db: "admin" });
              if (existing) {
                print("User '" + user + "' already exists in admin; skipping create.");
              } else {
                admin.createUser({ user, pwd: pass, roles: [ { role: "root", db: "admin" } ] });
                print("Created admin user '" + user + "'.");
              }
              JS
              S3_MONGO_USER="$S3_MONGO_USER" S3_MONGO_PASS="$S3_MONGO_PASS" mongosh --file /tmp/create_app_user.js || true

              # enable authorization
              if grep -q '^security:' "$CONF"; then
                if grep -qE '^[[:space:]]*authorization:' "$CONF"; then
                  sed -ri 's/^\s*authorization\s*:\s*.*/  authorization: enabled/' "$CONF"
                else
                  awk '{print} /^security:/{print "  authorization: enabled"}' "$CONF" | tee "$CONF.new" >/dev/null && mv "$CONF.new" "$CONF"
                fi
              else
                printf '\nsecurity:\n  authorization: enabled\n' >> "$CONF"
              fi
              systemctl restart mongod
            fi

            ss -lntp | grep ':27017' || true
          EOT
          ]
        }
      }
    ]
  })

  tags = {
    Name = "nat20-mongo-install-8-0"
  }
}

resource "aws_ssm_association" "mongo_install_8_0" {
  name = aws_ssm_document.mongo_install_8_0.name

  targets {
    key    = "tag:Name"
    values = ["terraform-mongodb"]
  }

  compliance_severity = "MEDIUM"

  # Ensure the EBS volume is attached before running (adjust if your resource names differ)
  depends_on = [
    aws_volume_attachment.mongo_data_attachment
  ]
}
