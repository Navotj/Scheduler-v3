###############################################
# Security Groups (locked down, functional)
# - Backend: ONLY ALB -> backend_port
# - MongoDB: ONLY Backend -> 27017
# - No SSH ingress (use SSM)
###############################################

# Uses data sources from data_sources.tf:
# data "aws_vpc" "default" {}
# data "aws_subnet" "eu_central_1b" {}

# Backend SG: no public ingress; rule below allows only from ALB SG
resource "aws_security_group" "backend_access" {
  name        = "backend-access"
  description = "Backend app traffic (only from ALB)"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "backend-access" }
}

# MongoDB SG: no inline ingress; rule below allows only from Backend SG
resource "aws_security_group" "mongodb_access" {
  name        = "mongodb-access"
  description = "MongoDB access restricted to backend only"
  vpc_id      = data.aws_vpc.default.id

  # Egress for SSM/updates
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "mongodb-access" }
}

# ALB SG is defined in alb_backend.tf as aws_security_group.alb

# Allow ONLY the ALB SG to reach backend on app port
resource "aws_security_group_rule" "backend_ingress_from_alb" {
  type                     = "ingress"
  description              = "ALB to Backend on app port"
  security_group_id        = aws_security_group.backend_access.id
  source_security_group_id = aws_security_group.alb.id
  from_port                = var.backend_port
  to_port                  = var.backend_port
  protocol                 = "tcp"
}

# Allow ONLY the Backend SG to reach MongoDB on 27017
resource "aws_security_group_rule" "mongodb_ingress_from_backend" {
  type                     = "ingress"
  description              = "Backend to MongoDB 27017"
  security_group_id        = aws_security_group.mongodb_access.id
  source_security_group_id = aws_security_group.backend_access.id
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
}
