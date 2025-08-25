# Default VPC (used for SGs and VPC CIDR restriction)
data "aws_vpc" "default" {
  default = true
}

# Backend SG
# - Ingress: CloudFront only on 80/443 via AWS-managed prefix list ID (variable).
# - Egress: HTTPS to VPC CIDR (to reach Interface Endpoints), DNS, and NTP.
resource "aws_security_group" "backend" {
  name        = "${var.app_prefix}-sg-backend"
  description = "Backend SG for API and SSM via interface endpoints"
  vpc_id      = data.aws_vpc.default.id

  ingress = []
  egress  = []

  revoke_rules_on_delete = true

  tags = {
    Name = "${var.app_prefix}-sg-backend"
  }
}

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

resource "aws_security_group_rule" "backend_egress_https_vpc" {
  type              = "egress"
  description       = "Backend to VPC Interface Endpoints HTTPS"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = [data.aws_vpc.default.cidr_block]
  security_group_id = aws_security_group.backend.id
}

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
# - Ingress: only from backend on 27017.
# - Egress: HTTPS to VPC CIDR (Interface Endpoints), DNS, and NTP.
resource "aws_security_group" "database" {
  name        = "${var.app_prefix}-sg-database"
  description = "Database SG: only backend may connect; SSM via interface endpoints"
  vpc_id      = data.aws_vpc.default.id

  ingress = []
  egress  = []

  revoke_rules_on_delete = true

  tags = {
    Name = "${var.app_prefix}-sg-database"
  }
}

resource "aws_security_group_rule" "db_from_backend" {
  type                     = "ingress"
  description              = "Backend to MongoDB"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  security_group_id        = aws_security_group.database.id
  source_security_group_id = aws_security_group.backend.id
}

resource "aws_security_group_rule" "database_egress_https_vpc" {
  type              = "egress"
  description       = "DB to VPC Interface Endpoints HTTPS"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = [data.aws_vpc.default.cidr_block]
  security_group_id = aws_security_group.database.id
}

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
