############################################################
# NAT Gateway for private subnets (enables outbound internet)
# - EIP for NAT
# - NAT in eu-central-1a public subnet
# - Default route in private route table -> NAT
#
# Uses existing data/resources already present in your stack:
#   - data.aws_subnet.eu_central_1a   (public subnet)
#   - aws_route_table.private_1b      (private route table)
############################################################

resource "aws_eip" "nat_eip" {
  domain = "vpc"

  tags = {
    Name = "nat20-nat-eip"
  }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat_eip.id
  subnet_id     = data.aws_subnet.eu_central_1a.id

  tags = {
    Name = "nat20-nat"
  }
}

# Private route table default route through NAT
resource "aws_route" "private_default_via_nat" {
  route_table_id         = aws_route_table.private_1b.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main.id
}
