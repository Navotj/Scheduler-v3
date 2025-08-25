# NOTE: Reuse existing data.aws_vpc.default from security_groups.tf

# All subnets in the default VPC (attach endpoints across these)
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

  # No egress needed on endpoint ENIs
  egress = []

  tags = {
    Name = "${var.app_prefix}-sg-ssm-endpoints"
  }
}

# Interface VPC Endpoint: SSM
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.eu-central-1.ssm"
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
  service_name        = "com.amazonaws.eu-central-1.ec2messages"
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
  service_name        = "com.amazonaws.eu-central-1.ssmmessages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.app_prefix}-vpce-ssmmessages"
  }
}

# Interface VPC Endpoint: CloudWatch Logs (needed if Session Manager logging to CloudWatch is enabled; safe to include)
resource "aws_vpc_endpoint" "logs" {
  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.eu-central-1.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.app_prefix}-vpce-logs"
  }
}

# Interface VPC Endpoint: S3 (use Interface so DB SG with VPC-only egress can reach it)
resource "aws_vpc_endpoint" "s3_interface" {
  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.eu-central-1.s3"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = data.aws_subnets.default_vpc_subnets.ids
  security_group_ids  = [aws_security_group.ssm_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.app_prefix}-vpce-s3"
  }
}
