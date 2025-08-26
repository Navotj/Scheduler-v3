# replace function (user_data_envwrap.tpl)
#!/usr/bin/env bash
set -euo pipefail

log() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }

# ---------- Injected DB env ----------
export DATABASE_USER="${database_user}"
export DATABASE_PASSWORD="${database_password}"
export DATABASE_NAME="${database_name}"

# Pass in (optional) serial console password as a runtime var
SERIAL_PW="${serial_console_password}"

# ---------- Ensure we can get in via Serial Console if SSM is stubborn ----------
# Set a temporary password for ec2-user (only if provided) and allow password auth on console/sshd.
if [[ -n "$${SERIAL_PW}" ]]; then
  log "Setting temporary password for ec2-user (for Serial Console emergency access)"
  echo "ec2-user:$${SERIAL_PW}" | chpasswd

  # Enable password auth explicitly (keep other defaults)
  install -d -m 0755 /etc/ssh/sshd_config.d
  cat >/etc/ssh/sshd_config.d/50-serial-console.conf <<'CONF'
PasswordAuthentication yes
ChallengeResponseAuthentication no
UsePAM yes
CONF
  systemctl restart sshd || true
fi

# ---------- Force SSM agent to register (database instance) ----------
log "Detect region via IMDSv2"
TOKEN="$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")"
REGION="$(curl -sS -H "X-aws-ec2-metadata-token: $${TOKEN}" http://169.254.169.254/latest/dynamic/instance-identity/document | awk -F\" '/region/ {print $4}')"
log "Region: $${REGION}"

log "Refresh dnf metadata"
dnf -y makecache

log "Install/reinstall amazon-ssm-agent"
dnf -y reinstall amazon-ssm-agent || dnf -y install amazon-ssm-agent

log "Pin SSM agent to region and clear any stale registration"
install -d -m 0755 /etc/amazon/ssm
printf '{"Agent":{"Region":"%s"}}\n' "$${REGION}" > /etc/amazon/ssm/amazon-ssm-agent.json
systemctl stop amazon-ssm-agent || true
rm -rf /var/lib/amazon/ssm/*
systemctl enable --now amazon-ssm-agent

# ---------- Run database bootstrap ----------
install -d -m 0755 /opt/bootstrap
cat > /opt/bootstrap/user_data_database.sh <<'EOS'
${script}
EOS
chmod 0755 /opt/bootstrap/user_data_database.sh

log "Executing database bootstrap script"
/opt/bootstrap/user_data_database.sh

log "Database user-data completed"
