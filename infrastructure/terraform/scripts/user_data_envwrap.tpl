#!/usr/bin/env bash
# Mirror output to both a file and the EC2 console buffer.
exec > >(tee -a /var/log/user-data.log /dev/console) 2>&1
set -euo pipefail

log() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }

# ---------- Injected env (safe: no -x echoing) ----------
export DATABASE_USER="${database_user}"
export DATABASE_PASSWORD="${database_password}"
export DATABASE_NAME="${database_name}"

%{ if database_host != "" }
export DATABASE_HOST="${database_host}"
%{ endif }

%{ if root_domain != "" }
export ROOT_DOMAIN="${root_domain}"
%{ endif }

%{ if jwt_secret != "" }
export JWT_SECRET="${jwt_secret}"
%{ endif }

# Optional OAuth provider credentials (conditionally exported)
%{ if oauth_google_client_id != "" }
export OAUTH_GOOGLE_CLIENT_ID="${oauth_google_client_id}"
%{ endif }
%{ if oauth_google_client_secret != "" }
export OAUTH_GOOGLE_CLIENT_SECRET="${oauth_google_client_secret}"
%{ endif }
%{ if oauth_github_client_id != "" }
export OAUTH_GITHUB_CLIENT_ID="${oauth_github_client_id}"
%{ endif }
%{ if oauth_github_client_secret != "" }
export OAUTH_GITHUB_CLIENT_SECRET="${oauth_github_client_secret}"
%{ endif }
%{ if oauth_discord_client_id != "" }
export OAUTH_DISCORD_CLIENT_ID="${oauth_discord_client_id}"
%{ endif }
%{ if oauth_discord_client_secret != "" }
export OAUTH_DISCORD_CLIENT_SECRET="${oauth_discord_client_secret}"
%{ endif }

# ---------- Minimal AL2023: make sure needed tools exist ----------
log "DNF makecache"
dnf -y makecache

# Avoid curl-minimal ↔ curl conflict; install only what's needed.
log "Install shadow-utils and jq (idempotent)"
dnf -y install shadow-utils jq || true

# ---------- Ensure/refresh SSM agent and registration ----------
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
dnf -y reinstall amazon-ssm-agent || dnf -y install amazon-ssm-agent

log "Pin SSM agent to region and clear any stale registration"
install -d -m 0755 /etc/amazon/ssm
printf '{"Agent":{"Region":"%s"}}\n' "$${REGION}" > /etc/amazon/ssm/amazon-ssm-agent.json
systemctl stop amazon-ssm-agent || true
rm -rf /var/lib/amazon/ssm/* || true
systemctl enable --now amazon-ssm-agent || true

# ---------- Execute role-specific payload ----------
install -d -m 0755 /opt/bootstrap
cat > /opt/bootstrap/user_data_payload.sh <<'EOS'
${script}
EOS
chmod 0755 /opt/bootstrap/user_data_payload.sh

log "Executing payload script"
/opt/bootstrap/user_data_payload.sh || log "WARN: payload script exited non-zero"

log "User-data completed"
