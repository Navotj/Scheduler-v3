############################################################
# SSM Association: Install & start MongoDB on Mongo EC2
# - Idempotent: skips if mongod already installed
# - Requires outbound internet (via NAT) to reach repo.mongodb.org
# Targets:
#   - Name=terraform-mongodb OR Name=terraform-mongo
############################################################

resource "aws_ssm_association" "mongo_install" {
  name = "AWS-RunShellScript"

  parameters = {
    "commands" = <<EOT
#!/usr/bin/env bash
set -euo pipefail

if command -v mongod >/dev/null 2>&1; then
  echo "mongod already installed"
  sudo systemctl enable mongod || true
  sudo systemctl start mongod || true
  systemctl is-active mongod || true
  ss -lntp | grep ':27017' || true
  exit 0
fi

# MongoDB 7.0 repo for Amazon Linux 2023
sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo >/dev/null <<'EOF'
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/amazon/2023/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-7.0.asc
EOF

# Install and start
sudo dnf clean all || sudo yum clean all
sudo dnf -y install mongodb-org || sudo yum -y install mongodb-org
sudo systemctl enable --now mongod
sleep 1
systemctl is-active mongod || true
ss -lntp | grep ':27017' || true
EOT
  }

  targets {
    key    = "tag:Name"
    values = ["terraform-mongodb", "terraform-mongo"]
  }
}
