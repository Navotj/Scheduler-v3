##############################
# VPC (minimal, single-AZ)
##############################

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  az0 = data.aws_availability_zones.available.names[0]
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = { Name = "${var.app_prefix}-vpc" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.app_prefix}-igw" }
}

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.0.0/24"
  availability_zone       = local.az0
  map_public_ip_on_launch = false
  tags                    = { Name = "${var.app_prefix}-public-a" }
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = local.az0
  tags              = { Name = "${var.app_prefix}-private-a" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.app_prefix}-nat-eip" }
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_a.id
  tags          = { Name = "${var.app_prefix}-nat" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.app_prefix}-public-rt" }
}

resource "aws_route" "public_to_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.igw.id
}

resource "aws_route_table_association" "public_assoc" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.app_prefix}-private-rt" }
}

resource "aws_route" "private_to_nat" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.nat.id
}

resource "aws_route_table_association" "private_assoc" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}
