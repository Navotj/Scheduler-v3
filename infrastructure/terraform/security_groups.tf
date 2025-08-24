# Default VPC (used for SGs and VPC CIDR restriction)
data "aws_vpc" "default" {
  default = true
}

# ---------------------------------
# Security Groups (cycle-free setup)
# ---------------------------------

# Backend SG (rules managed via aws_security_group_rule to avoid update-order limits)
resource "aws_security_group" "backend" {
  name_prefix = "${var.app_prefix}-sg-backend-"
  description = "Backend SG CloudFront ingress and minimal egress"
  vpc_id      = data.aws_vpc.default.id

  # Remove default allow-all rules so we can add only what we need below
  ingress = []
  egress  = []

  revoke_rules_on_delete = true

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.app_prefix}-sg-backend"
  }
}

# Ingress from CloudFront only (HTTP/HTTPS) using AWS-managed prefix list ID
resource "aws_security_group_rule" "backend_ingress_http" {
  type              = "ingress"
  description       = "CloudFront to backend HTTP"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  prefix_list_ids   = [var.cloudfront_origin_prefix_list_id]
  security_group_id = aws_security_group.backend.id
}

resource "aws_security_group_rule" "backend_ingress_https" {
  type              = "ingress"
  description       = "CloudFront to backend HTTPS"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  prefix_list_ids   = [var.cloudfront_origin_prefix_list_id]
  security_group_id = aws_security_group.backend.id
}

# Egress to MongoDB within VPC (restrict to VPC CIDR to avoid SG-to-SG cycle)
resource "aws_security_group_rule" "backend_egress_mongo" {
  type              = "egress"
  description       = "Backend to MongoDB within VPC"
  from_port         = 27017
  to_port           = 27017
  protocol          = "tcp"
  cidr_blocks       = [data.aws_vpc.default.cidr_block]
  security_group_id = aws_security_group.backend.id
}

# Minimal Internet egress for SSM/S3/updates (HTTPS)
resource "aws_security_group_rule" "backend_egress_https" {
  type                = "egress"
  description         = "HTTPS egress for system and SSM"
  from_port           = 443
  to_port             = 443
  protocol            = "tcp"
  cidr_blocks         = ["0.0.0.0/0"]
  ipv6_cidr_blocks    = ["::/0"]
  security_group_id   = aws_security_group.backend.id
}

# DNS (UDP/TCP 53)
resource "aws_security_group_rule" "backend_egress_dns_udp" {
  type                = "egress"
  description         = "DNS UDP"
  from_port           = 53
  to_port             = 53
  protocol            = "udp"
  cidr_blocks         = ["0.0.0.0/0"]
  ipv6_cidr_blocks    = ["::/0"]
  security_group_id   = aws_security_group.backend.id
}

resource "aws_security_group_rule" "backend_egress_dns_tcp" {
  type                = "egress"
  description         = "DNS TCP"
  from_port           = 53
  to_port             = 53
  protocol            = "tcp"
  cidr_blocks         = ["0.0.0.0/0"]
  ipv6_cidr_blocks    = ["::/0"]
  security_group_id   = aws_security_group.backend.id
}

# NTP (UDP 123)
resource "aws_security_group_rule" "backend_egress_ntp" {
  type                = "egress"
  description         = "NTP UDP"
  from_port           = 123
  to_port             = 123
  protocol            = "udp"
  cidr_blocks         = ["0.0.0.0/0"]
  ipv6_cidr_blocks    = ["::/0"]
  security_group_id   = aws_security_group.backend.id
}

# Database SG (deny-all egress; only backend may connect on 27017)
resource "aws_security_group" "database" {
  name_prefix = "${var.app_prefix}-sg-database-"
  description = "Database SG: only backend may connect on 27017"
  vpc_id      = data.aws_vpc.default.id

  # Explicitly no default rules
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

# Allow DB ingress from Backend SG (separate resource to avoid SG ↔ SG cycles)
resource "aws_security_group_rule" "db_from_backend" {
  type                     = "ingress"
  description              = "Backend to MongoDB"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  security_group_id        = aws_security_group.database.id
  source_security_group_id = aws_security_group.backend.id
}
