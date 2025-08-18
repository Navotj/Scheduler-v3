############################################################
# Private SSM connectivity (no public IPs)
# VPC Endpoints + Private Route Table + S3 Gateway Endpoint
# NAT Gateway for general outbound internet
############################################################

# Security group for the VPC endpoints' ENIs — allow HTTPS from backend & mongo
resource "aws_security_group" "vpc_endpoints" {
  name        = "nat20-vpc-endpoints-sg"
  description = "Allow HTTPS from backend & mongo to VPC Interface Endpoints"
  vpc_id      = data.aws_subnet.eu_central_1b.vpc_id

  ingress {
    description      = "HTTPS from backend"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    security_groups  = [aws_security_group.backend_access.id]
  }

  ingress {
    description      = "HTTPS from mongo"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    security_groups  = [aws_security_group.mongodb_access.id]
  }

  egress {
    description = "All egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "nat20-vpc-endpoints-sg" }
}

# SSM endpoint (required)
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = data.aws_subnet.eu_central_1b.vpc_id
  service_name        = "com.amazonaws.eu-central-1.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [data.aws_subnet.eu_central_1b.id]
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "nat20-ssm-endpoint" }
}

# SSMMessages endpoint (required)
resource "aws_vpc_endpoint" "ssmmessages" {
  vpc_id              = data.aws_subnet.eu_central_1b.vpc_id
  service_name        = "com.amazonaws.eu-central-1.ssmmessages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [data.aws_subnet.eu_central_1b.id]
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "nat20-ssmmessages-endpoint" }
}

# EC2Messages endpoint (required)
resource "aws_vpc_endpoint" "ec2messages" {
  vpc_id              = data.aws_subnet.eu_central_1b.vpc_id
  service_name        = "com.amazonaws.eu-central-1.ec2messages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [data.aws_subnet.eu_central_1b.id]
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "nat20-ec2messages-endpoint" }
}

# Optional CloudWatch Logs endpoint
resource "aws_vpc_endpoint" "logs" {
  vpc_id              = data.aws_subnet.eu_central_1b.vpc_id
  service_name        = "com.amazonaws.eu-central-1.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [data.aws_subnet.eu_central_1b.id]
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "nat20-logs-endpoint" }
}

# Private route table
resource "aws_route_table" "private_1b" {
  vpc_id = data.aws_subnet.eu_central_1b.vpc_id
  tags   = { Name = "nat20-private-rt-1b" }
}

# Associate it to your private subnet (eu-central-1b)
resource "aws_route_table_association" "private_1b_assoc" {
  subnet_id      = data.aws_subnet.eu_central_1b.id
  route_table_id = aws_route_table.private_1b.id
}

# S3 Gateway VPC Endpoint attached to that route table
resource "aws_vpc_endpoint" "s3_gateway" {
  vpc_id            = data.aws_subnet.eu_central_1b.vpc_id
  service_name      = "com.amazonaws.eu-central-1.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private_1b.id]
  tags              = { Name = "nat20-s3-gateway-endpoint" }
}

# NAT Gateway for private subnet outbound
resource "aws_eip" "nat_eip" {
  domain = "vpc"
  tags   = { Name = "nat20-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat_eip.id
  subnet_id     = data.aws_subnet.eu_central_1a.id
  tags          = { Name = "nat20-nat" }
}

# Private route table default route through NAT
resource "aws_route" "private_default_via_nat" {
  route_table_id         = aws_route_table.private_1b.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main.id
}
