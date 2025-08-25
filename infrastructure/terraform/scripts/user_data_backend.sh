#!/bin/bash
set -euxo pipefail

systemctl enable amazon-ssm-agent
systemctl start amazon-ssm-agent

# Wait for the attached data volume to appear (up to ~3 minutes)
DEV_CANDIDATES=("/dev/xvdf" "/dev/nvme1n1")
DEV_FOUND=""
for i in $(seq 1 60); do
  for d in "${DEV_CANDIDATES[@]}"; do
    if [ -b "$d" ]; then
      DEV_FOUND="$d"
      break
    fi
  done
  if [ -n "$DEV_FOUND" ]; then
    break
  fi
  sleep 3
done

# If the device was found, ensure it has a filesystem and mount it at /opt/app
mkdir -p /opt/app
if [ -n "${DEV_FOUND}" ]; then
  LABEL_NAME="appdata"
  if ! blkid -s LABEL -o value "${DEV_FOUND}" | grep -q "^${LABEL_NAME}$"; then
    mkfs.ext4 -F -L "${LABEL_NAME}" "${DEV_FOUND}"
  fi

  # Ensure fstab contains a mount by label for persistence
  if ! grep -q "LABEL=${LABEL_NAME} " /etc/fstab; then
    echo "LABEL=${LABEL_NAME} /opt/app ext4 defaults,noatime 0 2" >> /etc/fstab
  fi

  # Mount it
  mount -a || mount "${DEV_FOUND}" /opt/app
fi

# Permissions and basics
chown -R ec2-user:ec2-user /opt/app
chmod 755 /opt/app

# Ensure unzip + awscli are present for later SSM-driven deployments
dnf install -y unzip awscli || true
