##############################
# Backend Security Groups
# - Separate SGs for ingress and egress to keep rule counts low.
# - Ingress SG: allow TCP/3000 from anywhere (API calls).
# - Egress SG: allow TCP/27017 to the database SG, plus minimal outbound for SSM/dnf (HTTPS 443) and DNS (53).
# - No assumptions about VPC: vpc_id is derived from the existing database SG to avoid guessing.
##############################

# Ingress-only SG for backend API (no egress)
resource "aws_security_group" "backend_ingress" {
  name                   = "${var.app_prefix}-backend-ingress"
  description            = "Backend ingress: allow TCP/3000 for API calls"
  vpc_id                 = aws_security_group.database.vpc_id
  revoke_rules_on_delete = true

  # Allow API calls on port 3000 from anywhere (tighten later if needed).
  ingress {
    description = "API calls"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Explicitly no egress rules here (prevents default allow-all).
  egress = []

  tags = {
    Name = "${var.app_prefix}-backend-ingress"
  }
}

# Egress-only SG for backend instance
resource "aws_security_group" "backend_egress" {
  name                   = "${var.app_prefix}-backend-egress"
  description            = "Backend egress: MongoDB 27017 to DB SG; HTTPS 443 for SSM/dnf; DNS 53"
  vpc_id                 = aws_security_group.database.vpc_id
  revoke_rules_on_delete = true

  # Explicitly no ingress rules here.
  ingress = []

  # MongoDB to database SG on 27017
  egress {
    description     = "MongoDB to database SG"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.database.id]
  }

  # HTTPS for SSM/S3/dnf (keep simple and minimal)
  egress {
    description = "HTTPS for SSM/S3/dnf"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # DNS (UDP)
  egress {
    description = "DNS (UDP)"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # DNS (TCP)
  egress {
    description = "DNS (TCP)"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.app_prefix}-backend-egress"
  }
}
