#!/usr/bin/env bash
set -euo pipefail

# Injected by Terraform from GitHub Actions secrets
export DATABASE_USER="${database_user}"
export DATABASE_PASSWORD="${database_password}"
export DATABASE_NAME="${database_name}"

# Write the provided setup script to disk and execute it
install -d -m 0755 /opt/bootstrap
cat > /opt/bootstrap/user_data_database.sh <<'EOS'
${script}
EOS
chmod 0755 /opt/bootstrap/user_data_database.sh

/opt/bootstrap/user_data_database.sh
