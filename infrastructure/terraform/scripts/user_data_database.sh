#!/usr/bin/bash
set -euo pipefail
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

systemctl enable chronyd || true
systemctl restart chronyd || true

REGION="$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | sed -n 's/.*"region"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

if command -v amazon-ssm-agent >/dev/null 2>&1 || rpm -q amazon-ssm-agent >/dev/null 2>&1; then
  systemctl enable amazon-ssm-agent
  systemctl restart amazon-ssm-agent
else
  mkdir -p /tmp/ssm
  curl -fL --retry 5 --retry-delay 2 "https://s3.${REGION}.amazonaws.com/amazon-ssm-${REGION}/latest/linux_amd64/amazon-ssm-agent.rpm" -o /tmp/ssm/amazon-ssm-agent.rpm
  rpm -Uvh /tmp/ssm/amazon-ssm-agent.rpm
  systemctl enable amazon-ssm-agent
  systemctl restart amazon-ssm-agent
fi
