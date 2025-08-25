# Default VPC (used for SGs and VPC CIDR restriction)
data "aws_vpc" "default" {
  default = true
}

# ---------------------------------
# Rule limits (for your awareness, not used programmatically)
# AWS defaults: 60 ingress + 60 egress rules per security group (IPv4/IPv6 each count as separate rules).
# This layout stays FAR below those limits.
# ---------------------------------

# ----------------------------
# Backend SGs (split by purpose)
# ----------------------------

# Identity SG to reference from Database SG (no rules)
resource "aws_security_group" "backend_ident" {
  name_prefix = "${var.app_prefix}-sg-backend-ident-"
  description = "Backend identity SG (attach to backend EC2; referenced by DB SG)"
  vpc_id      = data.aws_vpc.default.id

  ingress = []
  egress  = []

  revoke_rules_on_delete = true

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.app_prefix}-sg-backend-ident"
  }
}

# Ingress-only SG: CloudFront -> Backend (HTTPS only to minimize rules)
resource "aws_security_group" "backend_ingress" {
  name_prefix = "${var.app_prefix}-sg-backend-ingress-"
  description = "Backend ingress from CloudFront (HTTPS only)"
  vpc_id      = data.aws_vpc.default.id

  ingress = []
  egress  = []

  revoke_rules_on_delete = true

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.app_prefix}-sg-backend-ingress"
  }
}

# Single ingress rule: HTTPS from CloudFront-managed prefix list (1 rule)
resource "aws_vpc_security_group_ingress_rule" "backend_from_cloudfront_https" {
  security_group_id = aws_security_group.backend_ingress.id
  description       = "CloudFront to backend HTTPS"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  prefix_list_id    = var.cloudfront_origin_prefix_list_id
}

# Egress-only SG: baseline outbound (single rule keeps count low)
resource "aws_security_group" "backend_egress" {
  name_prefix = "${var.app_prefix}-sg-backend-egress-"
  description = "Backend baseline egress"
  vpc_id      = data.aws_vpc.default.id

  ingress = []
  egress  = []

  revoke_rules_on_delete = true

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.app_prefix}-sg-backend-egress"
  }
}

# Allow all outbound (covers SSM/S3/updates/DNS/NTP) — 1 rule total
resource "aws_vpc_security_group_egress_rule" "backend_all_out_ipv4" {
  security_group_id = aws_security_group.backend_egress.id
  description       = "Baseline egress for OS updates/SSM/S3/DNS/NTP"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# ----------------------------
# Database SG (locked down)
# ----------------------------

resource "aws_security_group" "database" {
  name_prefix = "${var.app_prefix}-sg-database-"
  description = "Database SG: only backend may connect on 27017"
  vpc_id      = data.aws_vpc.default.id

  ingress = []
  egress  = []

  revoke_rules_on_delete = true

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.app_prefix}-sg-database"
  }
}

# Allow DB ingress from Backend identity SG (1 rule)
resource "aws_vpc_security_group_ingress_rule" "db_from_backend_ident" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = aws_security_group.backend_ident.id
  description                  = "Backend to MongoDB"
  from_port                    = 27017
  to_port                      = 27017
  ip_protocol                  = "tcp"
}

# ----------------------
# Outputs
# ----------------------
output "sg_backend_ident_id" {
  value       = aws_security_group.backend_ident.id
  description = "Attach this plus backend_ingress and backend_egress to the backend EC2"
}

output "sg_backend_ingress_id" {
  value       = aws_security_group.backend_ingress.id
  description = "Attach to backend EC2 for CloudFront HTTPS"
}

output "sg_backend_egress_id" {
  value       = aws_security_group.backend_egress.id
  description = "Attach to backend EC2 for outbound"
}

output "sg_database_id" {
  value       = aws_security_group.database.id
  description = "Attach to DB EC2 only"
}
