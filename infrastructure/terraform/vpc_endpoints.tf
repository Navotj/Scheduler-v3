##############################
# SSM connectivity without public internet. Minimal interface endpoints + S3 gateway.
##############################

data "aws_region" "current" {}

# SG for VPC interface endpoints: allow 443 from instances in VPC, and 443 egress to AWS services.
resource "aws_security_group" "vpce_ssm" {
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

# Interface endpoints for SSM, EC2 messages, and SSM messages.
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ssm"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [aws_subnet.private_a.id]
  security_group_ids  = [aws_security_group.vpce_ssm.id]
  tags                = { Name = "${var.app_prefix}-vpce-ssm" }
}

resource "aws_vpc_endpoint" "ec2messages" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ec2messages"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [aws_subnet.private_a.id]
  security_group_ids  = [aws_security_group.vpce_ssm.id]
  tags                = { Name = "${var.app_prefix}-vpce-ec2messages" }
}

resource "aws_vpc_endpoint" "ssmmessages" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ssmmessages"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [aws_subnet.private_a.id]
  security_group_ids  = [aws_security_group.vpce_ssm.id]
  tags                = { Name = "${var.app_prefix}-vpce-ssmmessages" }
}

# S3 gateway endpoint for agent updates and dnf repos without NAT.
resource "aws_vpc_endpoint" "s3_gateway" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
  tags              = { Name = "${var.app_prefix}-vpce-s3" }
}

# EC2 Instance Connect Endpoint (for SSH via AWS Console to private instances)
resource "aws_ec2_instance_connect_endpoint" "eic" {
  subnet_id          = aws_subnet.private_a.id
  security_group_ids = [aws_security_group.backend_ssh.id]

  tags = {
    Name = "${var.app_prefix}-eic-endpoint"
  }
}
