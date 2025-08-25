# Default VPC (used for SGs and VPC CIDR restriction)
data "aws_vpc" "default" {
  default = true
}

# ---------------------------------
# Security Groups (cycle-free setup)
# ---------------------------------

# Backend SG (rules managed via aws_security_group_rule)
resource "aws_security_group" "backend" {
  name        = "${var.app_prefix}-sg-backend"
  description = "Backend SG CloudFront ingress and minimal egress"
  vpc_id      = data.aws_vpc.default.id

  ingress = []
  egress  = []

  revoke_rules_on_delete = true

  tags = {
    Name = "${var.app_prefix}-sg-backend"
  }
}

# Ingress from CloudFront only (HTTPS) using AWS-managed prefix list ID
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

# Minimal egress for SSM via interface endpoints (HTTPS to VPC CIDR)
resource "aws_security_group_rule" "backend_egress_https_vpc" {
  type              = "egress"
  description       = "Backend to VPC Interface Endpoints HTTPS"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = [data.aws_vpc.default.cidr_block]
  security_group_id = aws_security_group.backend.id
}

# DNS (UDP/TCP 53) for private DNS resolution
resource "aws_security_group_rule" "backend_egress_dns_udp" {
  type              = "egress"
  description       = "Backend DNS UDP"
  from_port         = 53
  to_port           = 53
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.backend.id
}

resource "aws_security_group_rule" "backend_egress_dns_tcp" {
  type              = "egress"
  description       = "Backend DNS TCP"
  from_port         = 53
  to_port           = 53
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.backend.id
}

# NTP (UDP 123) to Amazon Time Sync Service
resource "aws_security_group_rule" "backend_egress_ntp" {
  type              = "egress"
  description       = "Backend NTP UDP to 169.254.169.123"
  from_port         = 123
  to_port           = 123
  protocol          = "udp"
  cidr_blocks       = ["169.254.169.123/32"]
  security_group_id = aws_security_group.backend.id
}

# Database SG (deny-all egress; only backend may connect on 27017)
resource "aws_security_group" "database" {
  name        = "${var.app_prefix}-sg-database"
  description = "Database SG: only backend may connect on 27017"
  vpc_id      = data.aws_vpc.default.id

  ingress = []
  egress  = []

  revoke_rules_on_delete = true

  tags = {
    Name = "${var.app_prefix}-sg-database"
  }
}

# Allow DB ingress from Backend SG
resource "aws_security_group_rule" "db_from_backend" {
  type                     = "ingress"
  description              = "Backend to MongoDB"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  security_group_id        = aws_security_group.database.id
  source_security_group_id = aws_security_group.backend.id
}

# Egress from Database SG for SSM via Interface Endpoints (HTTPS within VPC)
resource "aws_security_group_rule" "database_egress_https_vpc" {
  type              = "egress"
  description       = "DB to VPC Interface Endpoints HTTPS"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = [data.aws_vpc.default.cidr_block]
  security_group_id = aws_security_group.database.id
}

# DNS for DB (needed for private DNS on endpoints)
resource "aws_security_group_rule" "database_egress_dns_udp" {
  type              = "egress"
  description       = "DB DNS UDP"
  from_port         = 53
  to_port           = 53
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.database.id
}

resource "aws_security_group_rule" "database_egress_dns_tcp" {
  type              = "egress"
  description       = "DB DNS TCP"
  from_port         = 53
  to_port           = 53
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.database.id
}

# NTP for DB
resource "aws_security_group_rule" "database_egress_ntp" {
  type              = "egress"
  description       = "DB NTP UDP to 169.254.169.123"
  from_port         = 123
  to_port           = 123
  protocol          = "udp"
  cidr_blocks       = ["169.254.169.123/32"]
  security_group_id = aws_security_group.database.id
}
