# replace file
# Reuse default VPC from aws_default_vpc and ensure endpoints are private

# All subnets in the default VPC
data "aws_subnets" "default_vpc_subnets" {
  filter {
    name   = "vpc-id"
    values = [aws_default_vpc.default.id]
  }
}

# SG for Interface Endpoints: allow HTTPS from backend/database SGs only
resource "aws_security_group" "ssm_endpoints" {
  name        = "${var.app_prefix}-sg-ssm-endpoints"
  description = "Allow HTTPS from backend/database to SSM interface endpoints"
  vpc_id      = aws_default_vpc.default.id

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

# SSM (Interface)
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = aws_default_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "${var.app_prefix}-vpce-ssm" }
}

# EC2 Messages (Interface)
resource "aws_vpc_endpoint" "ec2messages" {
  vpc_id              = aws_default_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.ec2messages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "${var.app_prefix}-vpce-ec2messages" }
}

# SSM Messages (Interface)
resource "aws_vpc_endpoint" "ssmmessages" {
  vpc_id              = aws_default_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.ssmmessages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "${var.app_prefix}-vpce-ssmmessages" }
}

# Route tables of the default VPC (for S3 Gateway endpoint)
data "aws_route_tables" "default_vpc_route_tables" {
  filter {
    name   = "vpc-id"
    values = [aws_default_vpc.default.id]
  }
}

# S3 (Gateway) for agent bootstrap without internet/NAT
resource "aws_vpc_endpoint" "s3_gateway" {
  vpc_id            = aws_default_vpc.default.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = data.aws_route_tables.default_vpc_route_tables.ids

  tags = { Name = "${var.app_prefix}-vpce-s3-gateway" }
}
