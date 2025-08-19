############################################################
# Public subnet tags for AWS Load Balancer Controller discovery
# (Long-term fix so you can drop the explicit subnets annotation)
############################################################

# Tag each public subnet with cluster and role
resource "aws_ec2_tag" "subnet_1a_cluster" {
  resource_id = data.aws_subnet.eu_central_1a.id
  key         = "kubernetes.io/cluster/${aws_eks_cluster.this.name}"
  value       = "shared"
}

resource "aws_ec2_tag" "subnet_1b_cluster" {
  resource_id = data.aws_subnet.eu_central_1b.id
  key         = "kubernetes.io/cluster/${aws_eks_cluster.this.name}"
  value       = "shared"
}

resource "aws_ec2_tag" "subnet_1a_role_elb" {
  resource_id = data.aws_subnet.eu_central_1a.id
  key         = "kubernetes.io/role/elb"
  value       = "1"
}

resource "aws_ec2_tag" "subnet_1b_role_elb" {
  resource_id = data.aws_subnet.eu_central_1b.id
  key         = "kubernetes.io/role/elb"
  value       = "1"
}
