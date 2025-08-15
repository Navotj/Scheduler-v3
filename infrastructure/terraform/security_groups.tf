###############################################
# Security Groups
# - Backend instance: only ALB SG can reach backend_port
# - MongoDB instance: only Backend SG can reach 27017
# - No SSH ingress (use SSM)
###############################################

# Backend instance security group
resource "aws_security_group" "backend_access" {
  name        = "backend-access"
  description = "Backend app traffic (only from ALB)"
  vpc_id      = data.aws_vpc.default.id

  egress {
    description = "Allow all egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "backend-access" }
}

# NOTE: Do NOT redefine the ALB SG here if it exists in alb_backend.tf.
# Use the existing aws_security_group.alb from alb_backend.tf.

# Allow only ALB SG to reach Backend instance on backend_port
resource "aws_security_group_rule" "backend_ingress_from_alb" {
  type                     = "ingress"
  description              = "ALB to Backend"
  security_group_id        = aws_security_group.backend_access.id
  source_security_group_id = aws_security_group.alb.id
  from_port                = var.backend_port
  to_port                  = var.backend_port
  protocol                 = "tcp"
}

# MongoDB security group (use name_prefix to avoid duplicate name collision)
resource "aws_security_group" "mongodb_access" {
  name_prefix = "mongodb-access-"
  description = "MongoDB access (only from Backend)"
  vpc_id      = data.aws_vpc.default.id

  lifecycle {
    create_before_destroy = true
  }

  egress {
    description = "Allow all egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "mongodb-access" }
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
