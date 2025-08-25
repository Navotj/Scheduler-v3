# replace file
# Default VPC from aws_default_vpc.default

# Backend SG (no public ingress; CloudFront-only HTTPS ingress; minimal egress)
resource "aws_security_group" "backend" {
  name        = "${var.app_prefix}-sg-backend"
  description = "Backend SG CloudFront ingress and minimal egress"
  vpc_id      = aws_default_vpc.default.id

  ingress = []
  egress  = []

  revoke_rules_on_delete = true

  tags = { Name = "${var.app_prefix}-sg-backend" }
}

# CloudFront origin prefix list is provided via var.cloudfront_origin_prefix_list_id
resource "aws_security_group_rule" "backend_ingress_https" {
  type              = "ingress"
  description       = "CloudFront to backend HTTPS"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  prefix_list_ids   = [var.cloudfront_origin_prefix_list_id]
  security_group_id = aws_security_group.backend.id
}

# Egress to MongoDB within VPC
resource "aws_security_group_rule" "backend_egress_mongo" {
  type              = "egress"
  description       = "Backend to MongoDB within VPC"
  from_port         = 27017
  to_port           = 27017
  protocol          = "tcp"
  cidr_blocks       = [aws_default_vpc.default.cidr_block]
  security_group_id = aws_security_group.backend.id
}

# Egress HTTPS to Interface Endpoints (within VPC)
resource "aws_security_group_rule" "backend_egress_https_vpc" {
  type              = "egress"
  description       = "Backend to VPC Interface Endpoints HTTPS"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = [aws_default_vpc.default.cidr_block]
  security_group_id = aws_security_group.backend.id
}

# Allow HTTPS egress to S3 prefix list (via Gateway endpoint) to fetch the agent package if needed
data "aws_prefix_list" "s3" {
  name = "com.amazonaws.${var.aws_region}.s3"
}

resource "aws_security_group_rule" "backend_egress_https_s3" {
  type              = "egress"
  description       = "Backend to S3 via Gateway endpoint HTTPS"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  prefix_list_ids   = [data.aws_prefix_list.s3.id]
  security_group_id = aws_security_group.backend.id
}

# DNS (UDP/TCP 53)
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

# Database SG
resource "aws_security_group" "database" {
  name        = "${var.app_prefix}-sg-database"
  description = "Database SG: only backend may connect; SSM via interface endpoints"
  vpc_id      = aws_default_vpc.default.id

  ingress = []
  egress  = []

  revoke_rules_on_delete = true

  tags = { Name = "${var.app_prefix}-sg-database" }
}

# Allow DB ingress from Backend SG (MongoDB)
resource "aws_security_group_rule" "db_from_backend" {
  type                     = "ingress"
  description              = "Backend to MongoDB"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  security_group_id        = aws_security_group.database.id
  source_security_group_id = aws_security_group.backend.id
}

# Egress HTTPS to Interface Endpoints (within VPC)
resource "aws_security_group_rule" "database_egress_https_vpc" {
  type              = "egress"
  description       = "DB to VPC Interface Endpoints HTTPS"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = [aws_default_vpc.default.cidr_block]
  security_group_id = aws_security_group.database.id
}

# Allow HTTPS egress to S3 prefix list (via Gateway endpoint) to fetch the agent package if needed
resource "aws_security_group_rule" "database_egress_https_s3" {
  type              = "egress"
  description       = "DB to S3 via Gateway endpoint HTTPS"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  prefix_list_ids   = [data.aws_prefix_list.s3.id]
  security_group_id = aws_security_group.database.id
}

# DNS and NTP for DB
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

resource "aws_security_group_rule" "database_egress_ntp" {
  type              = "egress"
  description       = "DB NTP UDP to 169.254.169.123"
  from_port         = 123
  to_port           = 123
  protocol          = "udp"
  cidr_blocks       = ["169.254.169.123/32"]
  security_group_id = aws_security_group.database.id
}
