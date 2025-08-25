# All SSM-related VPC endpoints disabled to use NAT path for SSM/dnf.
# Keep this file so you can re-enable later by removing the count lines.

data "aws_region" "current" {}

# SG for interface endpoints (disabled)
resource "aws_security_group" "vpce_ssm" {
  count       = 0
  name        = "${var.app_prefix}-vpce-ssm"
  description = "Security group for SSM VPC endpoints"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Allow HTTPS from VPC to endpoints"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    description = "Allow HTTPS egress to AWS services"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.app_prefix}-vpce-ssm" }
}

# Interface endpoint: SSM (disabled)
resource "aws_vpc_endpoint" "ssm" {
  count               = 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ssm"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [aws_subnet.private_a.id]
  security_group_ids  = [aws_security_group.vpce_ssm[0].id]
  tags                = { Name = "${var.app_prefix}-vpce-ssm" }
}

# Interface endpoint: EC2 Messages (disabled)
resource "aws_vpc_endpoint" "ec2messages" {
  count               = 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ec2messages"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [aws_subnet.private_a.id]
  security_group_ids  = [aws_security_group.vpce_ssm[0].id]
  tags                = { Name = "${var.app_prefix}-vpce-ec2messages" }
}

# Interface endpoint: SSM Messages (disabled)
resource "aws_vpc_endpoint" "ssmmessages" {
  count               = 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ssmmessages"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [aws_subnet.private_a.id]
  security_group_ids  = [aws_security_group.vpce_ssm[0].id]
  tags                = { Name = "${var.app_prefix}-vpce-ssmmessages" }
}

# S3 Gateway endpoint (disabled)
resource "aws_vpc_endpoint" "s3_gateway" {
  count             = 0
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
  tags              = { Name = "${var.app_prefix}-vpce-s3" }
}
