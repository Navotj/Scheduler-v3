# replace function (user_data_envwrap.tpl)
#!/usr/bin/env bash
# Log everything for postmortem (view in EC2 -> Monitor and troubleshoot -> Get system log)
exec > >(tee -a /var/log/user-data.log) 2>&1
set -euo pipefail

log() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }

# ---------- Injected DB env ----------
export DATABASE_USER="${database_user}"
export DATABASE_PASSWORD="${database_password}"
export DATABASE_NAME="${database_name}"
SERIAL_PW="${serial_console_password}"

log "User-data start (database node)"

# ---------- Minimal AL2023: make sure needed tools exist ----------
log "DNF makecache"
dnf -y makecache

# chpasswd comes from shadow-utils on minimal images; install it (idempotent)
log "Install shadow-utils (for chpasswd) and core tools"
dnf -y install shadow-utils curl jq >/dev/null 2>&1 || true

# ---------- Optional: set serial-console password for ec2-user ----------
if [[ -n "$${SERIAL_PW}" ]]; then
  log "Setting temporary password for ec2-user (Serial Console fallback)"
  if command -v chpasswd >/dev/null 2>&1; then
    echo "ec2-user:$${SERIAL_PW}" | chpasswd || log "WARN: chpasswd failed"
  else
    log "WARN: chpasswd not found even after install attempt"
  fi

  # Ensure password auth allowed for emergency (does not open SSH to internet; SGs still gate)
  install -d -m 0755 /etc/ssh/sshd_config.d
  cat >/etc/ssh/sshd_config.d/50-serial-console.conf <<'CONF'
PasswordAuthentication yes
ChallengeResponseAuthentication no
UsePAM yes
CONF
  # Don't fail if systemd isn't ready yet
  systemctl restart sshd || true
fi

# ---------- Force SSM agent to register (database instance) ----------
log "Detect region via IMDSv2"
TOKEN="$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)"
REGION="$(curl -sS -H "X-aws-ec2-metadata-token: $${TOKEN}" http://169.254.169.254/latest/dynamic/instance-identity/document 2>/dev/null | jq -r .region || true)"
if [[ -z "$${REGION}" || "$${REGION}" == "null" ]]; then
  REGION="eu-central-1"
  log "IMDS region lookup failed; defaulting to $${REGION}"
else
  log "Region: $${REGION}"
fi

log "Install (or reinstall) amazon-ssm-agent"
dnf -y reinstall amazon-ssm-agent >/dev/null 2>&1 || dnf -y install amazon-ssm-agent

log "Pin SSM agent to region and clear any stale registration"
install -d -m 0755 /etc/amazon/ssm
printf '{"Agent":{"Region":"%s"}}\n' "$${REGION}" > /etc/amazon/ssm/amazon-ssm-agent.json
systemctl stop amazon-ssm-agent || true
rm -rf /var/lib/amazon/ssm/* || true
systemctl enable --now amazon-ssm-agent || true

# ---------- Run database bootstrap ----------
install -d -m 0755 /opt/bootstrap
cat > /opt/bootstrap/user_data_database.sh <<'EOS'
${script}
EOS
chmod 0755 /opt/bootstrap/user_data_database.sh

log "Executing database bootstrap script"
/opt/bootstrap/user_data_database.sh || log "WARN: database bootstrap script exited non-zero"

log "User-data completed (database node)"
