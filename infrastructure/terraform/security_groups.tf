# Default VPC (used for SGs and VPC CIDR restriction)
data "aws_vpc" "default" {
  default = true
}

# ---------------------------------
# Security Groups (cycle-free setup)
# ---------------------------------

# Backend SG:
# - Ingress: 80/443 only from CloudFront origin-facing managed prefix list (IPv4)
# - Egress:
#     * 27017 to VPC CIDR (DB lives inside VPC)
#     * 443 to Internet (SSM/S3/updates)
#     * DNS (53 TCP/UDP) + NTP (123 UDP)
resource "aws_security_group" "backend" {
  name        = "${var.app_prefix}-sg-backend"
  description = "Backend SG CloudFront ingress and minimal egress"
  vpc_id      = data.aws_vpc.default.id

  # Ingress from CloudFront only (HTTP/HTTPS) using AWS-managed prefix list ID
  ingress {
    description     = "CloudFront to backend HTTP"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [var.cloudfront_origin_prefix_list_id]
  }

  ingress {
    description     = "CloudFront to backend HTTPS"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [var.cloudfront_origin_prefix_list_id]
  }

  # Egress to MongoDB within VPC (restrict to VPC CIDR to avoid SG-to-SG cycle)
  egress {
    description = "Backend to MongoDB within VPC"
    from_port   = 27017
    to_port     = 27017
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }

  # Minimal Internet egress for SSM/S3/updates
  egress {
    description      = "HTTPS egress for system and SSM"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # DNS (UDP/TCP 53)
  egress {
    description      = "DNS UDP"
    from_port        = 53
    to_port          = 53
    protocol         = "udp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    description      = "DNS TCP"
    from_port        = 53
    to_port          = 53
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # NTP
  egress {
    description      = "NTP UDP"
    from_port        = 123
    to_port          = 123
    protocol         = "udp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Name = "${var.app_prefix}-sg-backend"
  }
}

# Database SG (no inline ingress from backend to avoid cycle)
resource "aws_security_group" "database" {
  name        = "${var.app_prefix}-sg-database"
  description = "Database SG: only backend may connect on 27017"
  vpc_id      = data.aws_vpc.default.id

  # Deny-all egress (return traffic is statefully allowed)
  egress = []

  tags = {
    Name = "${var.app_prefix}-sg-database"
  }
}

# Separate rule to allow DB ingress from Backend SG (breaks SG ↔ SG cycle)
resource "aws_security_group_rule" "db_from_backend" {
  type                     = "ingress"
  description              = "Backend to MongoDB"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  security_group_id        = aws_security_group.database.id
  source_security_group_id = aws_security_group.backend.id
}
