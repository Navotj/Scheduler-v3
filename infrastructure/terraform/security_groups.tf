# Default VPC (used for SGs)
data "aws_vpc" "default" {
  default = true
}

# CloudFront managed prefix list for origin-facing egress IPs
# Restrict backend ingress to only CloudFront (when accessed via internet-facing origin)
data "aws_prefix_list" "cloudfront_origin" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# -----------------------------
# Security Groups (least privilege)
# -----------------------------

# Backend SG:
# - Ingress: 80/443 only from CloudFront origin-facing managed prefix list
# - Egress:  27017 only to Database SG, plus minimal Internet egress for SSM/S3 (443) and DNS/NTP
resource "aws_security_group" "backend" {
  name        = "${var.app_prefix}-sg-backend"
  description = "Backend SG: allow only CloudFront -> backend, backend -> database, minimal egress"
  vpc_id      = data.aws_vpc.default.id

  # Ingress from CloudFront only (for HTTP/HTTPS to the backend origin)
  ingress {
    description     = "CloudFront -> backend (HTTP)"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_prefix_list.cloudfront_origin.id]
  }

  ingress {
    description     = "CloudFront -> backend (HTTPS)"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [data.aws_prefix_list.cloudfront_origin.id]
  }

  # Egress to database only on MongoDB port
  egress {
    description     = "Backend -> Database (MongoDB)"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.database.id]
  }

  # Minimal Internet egress for OS/SSM/S3 (HTTPS)
  egress {
    description      = "HTTPS egress for SSM/S3/OS updates"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # DNS (UDP/TCP 53) to resolve names
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

  # NTP for time sync
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

# Database SG:
# - Ingress: 27017 only from Backend SG
# - Egress: none (stateful return traffic is allowed)
resource "aws_security_group" "database" {
  name        = "${var.app_prefix}-sg-database"
  description = "Database SG: only backend may connect on 27017"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Backend -> MongoDB"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  # Deny-all egress (no outbound). Return traffic is statefully allowed.
  egress = []

  tags = {
    Name = "${var.app_prefix}-sg-database"
  }
}
