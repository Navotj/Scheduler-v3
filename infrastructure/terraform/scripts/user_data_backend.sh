#!/bin/bash
set -euxo pipefail

# Quality of life
echo "alias ll='ls -alF'" >> /home/ec2-user/.bashrc || true

# Use root volume for app files (no separate EBS device)
mkdir -p /opt/app
chown -R ec2-user:ec2-user /opt/app
chmod 755 /opt/app

# Tools for later SSM-driven deployments
dnf install -y unzip awscli || true
