###############################################
# Security Groups (locked down, functional)
# - Backend: ONLY ALB -> backend_port
# - MongoDB: ONLY Backend -> 27017
# - No SSH ingress (use SSM)
###############################################

# Uses the default VPC declared in main.tf:
# data "aws_vpc" "default" { default = true }

# Backend SG: accept traffic ONLY from the ALB SG on backend_port
resource "aws_security_group" "backend_access" {
  name        = "backend-access"
  description = "Backend app traffic (only from ALB)"
  vpc_id      = data.aws_vpc.default.id

  # No direct public ingress; rule is attached below to allow only from ALB SG.

  # Egress: allow all so the instance can reach the Internet (updates, SSM, etc.)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "backend-access" }
}

# MongoDB SG: accept traffic ONLY from Backend SG on 27017
resource "aws_security_group" "mongodb_access" {
  name        = "mongodb-access"
  description = "MongoDB access restricted to backend only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description              = "Backend -> MongoDB"
    from_port                = 27017
    to_port                  = 27017
    protocol                 = "tcp"
    source_security_group_id = aws_security_group.backend_access.id
  }

  # Egress: allow all so SSM agent and updates can reach AWS endpoints
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "mongodb-access" }
}

# ALB SG is defined in alb_backend.tf as aws_security_group.alb
# Attach the precise backend ingress rule to allow ONLY the ALB SG
resource "aws_security_group_rule" "backend_ingress_from_alb" {
  type                     = "ingress"
  description              = "ALB -> Backend on app port"
  security_group_id        = aws_security_group.backend_access.id
  source_security_group_id = aws_security_group.alb.id
  from_port                = var.backend_port
  to_port                  = var.backend_port
  protocol                 = "tcp"
}
