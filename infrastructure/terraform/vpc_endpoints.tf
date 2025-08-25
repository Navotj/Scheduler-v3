# Region helper (used to build endpoint service names)
data "aws_region" "current" {}

# Reuse your default VPC
data "aws_vpc" "default" {
  default = true
}

# All subnets in the default VPC (attach endpoints across these)
data "aws_subnets" "default_vpc_subnets" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security group for the Interface Endpoints' ENIs: allow HTTPS from backend/database SGs
resource "aws_security_group" "ssm_endpoints" {
  name        = "${var.app_prefix}-sg-ssm-endpoints"
  description = "Allow HTTPS from backend/database to SSM interface endpoints"
  vpc_id      = data.aws_vpc.default.id

  # Only allow inbound 443 from your app SGs
  ingress {
    description      = "Backend → endpoints :443"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    security_groups  = [aws_security_group.backend.id]
  }

  ingress {
    description      = "Database → endpoints :443"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    security_groups  = [aws_security_group.database.id]
  }

  # No egress needed on the endpoint ENIs
  egress = []

  tags = {
    Name = "${var.app_prefix}-sg-ssm-endpoints"
  }
}

# SSM endpoint
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.app_prefix}-vpce-ssm"
  }
}

# EC2 messages endpoint
resource "aws_vpc_endpoint" "ec2messages" {
  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ec2messages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.app_prefix}-vpce-ec2messages"
  }
}

# SSM messages endpoint
resource "aws_vpc_endpoint" "ssmmessages" {
  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ssmmessages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.app_prefix}-vpce-ssmmessages"
  }
}
