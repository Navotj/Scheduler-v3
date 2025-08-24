# Default VPC (used for SGs and VPC CIDR restriction)
data "aws_vpc" "default" {
  default = true
}

# ---------------------------------
# Security Groups (split to avoid per-SG rule limits)
# ---------------------------------

# Backend identity SG (no rules) — used for DB allowlisting
resource "aws_security_group" "backend" {
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

# Backend ingress SG — only CloudFront -> backend (HTTP/HTTPS)
resource "aws_security_group" "backend_ingress" {
  name_prefix = "${var.app_prefix}-sg-backend-ingress-"
  description = "Backend ingress from CloudFront only"
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

# CloudFront to backend HTTP
resource "aws_vpc_security_group_ingress_rule" "backend_from_cloudfront_http" {
  security_group_id = aws_security_group.backend_ingress.id
  description       = "CloudFront to backend HTTP"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  prefix_list_id    = var.cloudfront_origin_prefix_list_id
}

# CloudFront to backend HTTPS
resource "aws_vpc_security_group_ingress_rule" "backend_from_cloudfront_https" {
  security_group_id = aws_security_group.backend_ingress.id
  description       = "CloudFront to backend HTTPS"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  prefix_list_id    = var.cloudfront_origin_prefix_list_id
}

# Backend egress SG — single baseline egress (all protocols) to reduce rule count
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

# Allow all outbound (covers HTTPS, DNS, NTP, SSM, etc.) — minimizes rule count
resource "aws_vpc_security_group_egress_rule" "backend_all_out" {
  security_group_id = aws_security_group.backend_egress.id
  description       = "Baseline egress for OS updates/SSM/S3/DNS/NTP"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# Optional: direct backend-to-DB egress within VPC on 27017 (not strictly required due to baseline egress)
# Keeping explicit rule for clarity and future tightening if baseline egress is reduced.
resource "aws_vpc_security_group_egress_rule" "backend_to_db_vpc_mongo" {
  security_group_id = aws_security_group.backend_egress.id
  description       = "Backend to MongoDB within VPC on 27017"
  from_port         = 27017
  to_port           = 27017
  ip_protocol       = "tcp"
  cidr_ipv4         = data.aws_vpc.default.cidr_block
}

# Database SG (no egress; only backend identity SG may connect on 27017)
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

# Allow DB ingress from Backend identity SG (avoids SG↔SG update cycles)
resource "aws_vpc_security_group_ingress_rule" "db_from_backend_ident" {
  security_group_id             = aws_security_group.database.id
  referenced_security_group_id  = aws_security_group.backend.id
  description                   = "Backend to MongoDB"
  from_port                     = 27017
  to_port                       = 27017
  ip_protocol                   = "tcp"
}

# ----------------------
# Useful Security Group Outputs
# ----------------------
output "sg_backend_ident_id" {
  value = aws_security_group.backend.id
}

output "sg_backend_ingress_id" {
  value = aws_security_group.backend_ingress.id
}

output "sg_backend_egress_id" {
  value = aws_security_group.backend_egress.id
}

output "sg_database_id" {
  value = aws_security_group.database.id
}
