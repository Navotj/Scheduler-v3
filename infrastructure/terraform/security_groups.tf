############################################################
# Security Groups for ALB, Backend and MongoDB
############################################################

# CloudFront origin-facing IPv4 prefix list
data "aws_ec2_managed_prefix_list" "cloudfront_origin" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# Backend instance security group (reachable only from ALB SG on backend_port)
resource "aws_security_group" "backend_access" {
  name        = "backend-access"
  description = "Backend app traffic (only from ALB)"
  vpc_id      = data.aws_vpc.default.id

  # Ingress added via separate rule referencing ALB SG

  egress {
    description     = "MongoDB access"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.mongodb_access.id]
  }

  egress {
    description = "HTTPS outbound for external APIs and updates"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "HTTP outbound for package repositories"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS resolution"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS resolution (TCP)"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "backend-access" }
}

# MongoDB instance SG
resource "aws_security_group" "mongodb_access" {
  name_prefix = "mongodb-access-"
  description = "MongoDB access (only from Backend)"
  vpc_id      = data.aws_vpc.default.id

  # Ingress added via separate rule referencing Backend SG

  egress {
    description = "HTTPS outbound for system updates and patches"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "HTTP outbound for package repositories"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS resolution"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS resolution (TCP)"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "mongodb-access" }
}

# ALB security group (restrict origin access to CloudFront only)
resource "aws_security_group" "alb" {
  name_prefix            = "nat20-alb-sg-"
  description            = "ALB security group (CloudFront origin fetchers only)"
  vpc_id                 = data.aws_vpc.default.id
  revoke_rules_on_delete = true

  lifecycle { create_before_destroy = true }

  # IPv4: restrict HTTP/HTTPS to CloudFront origin-facing prefix list
  ingress {
    description     = "HTTP from CloudFront origin fetchers (IPv4)"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront_origin.id]
  }

  ingress {
    description     = "HTTPS from CloudFront origin fetchers (IPv4)"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront_origin.id]
  }

  # Note: No IPv6 ingress to origin; CloudFront origin fetch to custom origins is IPv4.

  # Egress to backend instances on app port
  egress {
    description     = "Backend application traffic"
    from_port       = var.backend_port
    to_port         = var.backend_port
    protocol        = "tcp"
    security_groups = [aws_security_group.backend_access.id]
  }

  # Misc egress
  egress {
    description = "HTTPS for health checks and AWS API calls"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    description = "DNS resolution"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    description = "DNS resolution (TCP)"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "nat20-backend-alb-sg" }
}

# SG rules linking components
resource "aws_security_group_rule" "backend_ingress_from_alb" {
  type                     = "ingress"
  description              = "ALB to Backend"
  security_group_id        = aws_security_group.backend_access.id
  source_security_group_id = aws_security_group.alb.id
  from_port                = var.backend_port
  to_port                  = var.backend_port
  protocol                 = "tcp"
}

resource "aws_security_group_rule" "mongodb_ingress_from_backend" {
  type                     = "ingress"
  description              = "Backend to MongoDB 27017"
  security_group_id        = aws_security_group.mongodb_access.id
  source_security_group_id = aws_security_group.backend_access.id
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
}
