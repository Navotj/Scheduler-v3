############################################################
# Security Groups for Backend and MongoDB
############################################################

# Backend instance security group (reachable only from ALB SG on backend_port)
resource "aws_security_group" "backend_access" {
  name        = "backend-access"
  description = "Backend app traffic (only from ALB)"
  vpc_id      = data.aws_vpc.default.id

  egress {
    description     = "MongoDB access"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.mongodb_access.id]
  }

  egress {
    description = "HTTPS outbound for external APIs and package updates"
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

resource "aws_security_group_rule" "backend_ingress_from_alb" {
  type                     = "ingress"
  description              = "ALB to Backend"
  security_group_id        = aws_security_group.backend_access.id
  source_security_group_id = aws_security_group.alb.id
  from_port                = var.backend_port
  to_port                  = var.backend_port
  protocol                 = "tcp"
}

resource "aws_security_group" "mongodb_access" {
  name_prefix = "mongodb-access-"
  description = "MongoDB access (only from Backend)"
  vpc_id      = data.aws_vpc.default.id

  lifecycle { create_before_destroy = true }

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


resource "aws_security_group_rule" "mongodb_ingress_from_backend" {
  type                     = "ingress"
  description              = "Backend to MongoDB 27017"
  security_group_id        = aws_security_group.mongodb_access.id
  source_security_group_id = aws_security_group.backend_access.id
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
}
