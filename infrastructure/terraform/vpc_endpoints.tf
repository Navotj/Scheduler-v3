# Minimal private SSM connectivity (no internet, no NAT)
# Reuses data.aws_vpc.default declared in security_groups.tf

# Subnets in the default VPC (attach endpoints across these)
data "aws_subnets" "default_vpc_subnets" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security group for Interface Endpoints: allow HTTPS from backend/database SGs only
resource "aws_security_group" "ssm_endpoints" {
  name        = "${var.app_prefix}-sg-ssm-endpoints"
  description = "Allow HTTPS from backend/database to SSM interface endpoints"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Backend to endpoints 443"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }

  ingress {
    description     = "Database to endpoints 443"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.database.id]
  }

  egress = []

  tags = {
    Name = "${var.app_prefix}-sg-ssm-endpoints"
  }
}

# Interface VPC Endpoint: SSM
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.app_prefix}-vpce-ssm"
  }
}

# Interface VPC Endpoint: EC2 Messages
resource "aws_vpc_endpoint" "ec2messages" {
  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.ec2messages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.app_prefix}-vpce-ec2messages"
  }
}

# Interface VPC Endpoint: SSM Messages
resource "aws_vpc_endpoint" "ssmmessages" {
  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.ssmmessages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.app_prefix}-vpce-ssmmessages"
  }
}
