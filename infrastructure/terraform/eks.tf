############################################################
# EKS Cluster + Managed Node Group (2 AZs, AL2023)
############################################################

resource "aws_iam_role" "eks_cluster" {
  name = "${var.project_name}-eks-cluster-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect    = "Allow",
        Principal = { Service = "eks.amazonaws.com" },
        Action    = "sts:AssumeRole"
      }
    ]
  })
  tags = { Name = "${var.project_name}-eks-cluster-role" }
}

resource "aws_iam_role_policy_attachment" "eks_cluster_AmazonEKSClusterPolicy" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_iam_role_policy_attachment" "eks_cluster_AmazonEKSVPCResourceController" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
}

resource "aws_security_group" "eks_cluster" {
  name        = "${var.project_name}-eks-cluster-sg"
  description = "Cluster communication with worker nodes"
  vpc_id      = data.aws_vpc.default.id

  egress {
    description = "All egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-eks-cluster-sg" }
}

resource "aws_eks_cluster" "this" {
  name     = "${var.project_name}-eks"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.eks_version

  vpc_config {
    subnet_ids              = [data.aws_subnet.eu_central_1a.id, data.aws_subnet.eu_central_1b.id]
    endpoint_private_access = false
    endpoint_public_access  = true
    security_group_ids      = [aws_security_group.eks_cluster.id]
    public_access_cidrs     = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-eks" }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_AmazonEKSClusterPolicy,
    aws_iam_role_policy_attachment.eks_cluster_AmazonEKSVPCResourceController
  ]
}

# Node group role
resource "aws_iam_role" "eks_node" {
  name = "${var.project_name}-eks-node-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect    = "Allow",
        Principal = { Service = "ec2.amazonaws.com" },
        Action    = "sts:AssumeRole"
      }
    ]
  })
  tags = { Name = "${var.project_name}-eks-node-role" }
}

resource "aws_iam_role_policy_attachment" "eks_node_AmazonEKSWorkerNodePolicy" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "eks_node_AmazonEC2ContainerRegistryReadOnly" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy_attachment" "eks_node_AmazonEKS_CNI_Policy" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_eks_node_group" "default" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.project_name}-ng"
  node_role_arn   = aws_iam_role.eks_node.arn
  subnet_ids      = [data.aws_subnet.eu_central_1a.id, data.aws_subnet.eu_central_1b.id]

  scaling_config {
    desired_size = var.desired_capacity
    min_size     = var.min_capacity
    max_size     = var.max_capacity
  }

  instance_types = var.node_instance_types

  # Migrate off AL2 to Amazon Linux 2023 for EKS >= 1.33
  ami_type = "AL2023_x86_64_STANDARD"

  # Pin node group to the cluster version so nodes roll on version bumps
  version = var.eks_version

  update_config {
    max_unavailable = 1
  }

  tags = { Name = "${var.project_name}-ng" }

  depends_on = [
    aws_eks_cluster.this
  ]
}

# EKS data sources (for providers)
data "aws_eks_cluster" "this" {
  name       = aws_eks_cluster.this.name
  depends_on = [aws_eks_cluster.this]
}

data "aws_eks_cluster_auth" "this" {
  name = aws_eks_cluster.this.name
}
