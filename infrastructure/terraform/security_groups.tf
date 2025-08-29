##############################
# Security Groups (minimal)
##############################

# Backend: ingress on 3000 from inside VPC only. No egress here.
resource "aws_security_group" "backend_ingress" {
  name        = "${var.app_prefix}-backend-ingress"
  description = "Backend ingress: TCP 3000 from VPC; no egress"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "API on 3000 from VPC"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [aws_subnet.private_a.cidr_block]
  }

  egress = []

  tags = { Name = "${var.app_prefix}-backend-ingress" }
}

# Backend: egress to Mongo 27017 within VPC, plus HTTPS and DNS for SSM/dnf.
resource "aws_security_group" "backend_egress" {
  name        = "${var.app_prefix}-backend-egress"
  description = "Backend egress: Mongo 27017 to VPC; HTTPS and DNS"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "Mongo to VPC"
    from_port   = 27017
    to_port     = 27017
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    description = "HTTPS outbound"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS UDP outbound"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS TCP outbound"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress = []

  tags = { Name = "${var.app_prefix}-backend-egress" }
}

# Database: ingress only from backend SG on 27017. No egress here.
resource "aws_security_group" "database_ingress" {
  name        = "${var.app_prefix}-database-ingress"
  description = "Database ingress: allow 27017 only from backend SG; no egress"
  vpc_id      = aws_vpc.main.id

  egress = []

  tags = { Name = "${var.app_prefix}-database-ingress" }
}

# Database: egress for HTTPS and DNS for SSM/dnf.
resource "aws_security_group" "database_egress" {
  name        = "${var.app_prefix}-database-egress"
  description = "Database egress: HTTPS and DNS"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "HTTPS outbound"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS UDP outbound"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS TCP outbound"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress = []

  tags = { Name = "${var.app_prefix}-database-egress" }
}

# Link: allow backend_egress SG to reach database_ingress SG on 27017.
resource "aws_security_group_rule" "database_ingress_from_backend" {
  type                     = "ingress"
  description              = "Mongo 27017 from backend egress SG"
  from_port                = 27017
  to_port                  = 27017
  protocol                 = "tcp"
  security_group_id        = aws_security_group.database_ingress.id
  source_security_group_id = aws_security_group.backend_egress.id
}

resource "aws_security_group" "apigw_vpc_link" {
  name        = "${var.app_prefix}-apigw-vpc-link"
  description = "API Gateway VPC Link egress to NLB on TCP 3000"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "To NLB on port 3000 within subnet"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [aws_subnet.private_a.cidr_block]
  }

  ingress = []

  tags = { Name = "${var.app_prefix}-apigw-vpc-link" }
}
