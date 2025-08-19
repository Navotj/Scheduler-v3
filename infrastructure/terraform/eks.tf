############################################################
# EKS Cluster + Managed Node Group (2 AZs, AL2023)
# Hardened: restricted API CIDRs, private endpoint enabled,
# control-plane logging, KMS envelope encryption, deletion protection.
############################################################

variable "eks_api_allowed_cidrs_ssm_name" {
  description = "SSM parameter name that contains a comma-separated list of CIDRs allowed to the public EKS API endpoint"
  type        = string
  default     = "/nat20/network/EKS_API_ALLOWED_CIDRS"
}

variable "api_allowed_cidrs" {
  description = "Fallback list of CIDRs (if SSM param empty). Example: [\"198.51.100.10/32\",\"203.0.113.0/32\"]"
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "CloudWatch retention for EKS control plane logs"
  type        = number
  default     = 30
}

# Load allowlist from SSM (comma-separated string)
data "aws_ssm_parameter" "eks_api_allowed_cidrs" {
  name            = var.eks_api_allowed_cidrs_ssm_name
  with_decryption = false
  # ignore if not present
  lifecycle {
    postcondition {
      condition     = can(self.value)
      error_message = "Failed to read SSM parameter ${var.eks_api_allowed_cidrs_ssm_name}."
    }
  }
}

locals {
  ssm_cidrs_raw   = try(data.aws_ssm_parameter.eks_api_allowed_cidrs.value, "")
  ssm_cidrs_list  = length(trim(local.ssm_cidrs_raw)) > 0 ? [for c in split(",", local.ssm_cidrs_raw) : trimspace(c)] : []
  public_cidrs    = length(local.ssm_cidrs_list) > 0 ? local.ssm_cidrs_list : var.api_allowed_cidrs
}

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

# CloudWatch logs group for control plane logs (precreate to set retention)
resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${var.project_name}-eks/cluster"
  retention_in_days = var.log_retention_days
}

# KMS key for envelope encryption of Kubernetes secrets
resource "aws_kms_key" "eks" {
  description             = "KMS key for EKS secrets envelope encryption (${var.project_name})"
  deletion_window_in_days = 7
  enable_key_rotation     = true
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${var.project_name}-eks-secrets"
  target_key_id = aws_kms_key.eks.key_id
}

resource "aws_eks_cluster" "this" {
  name     = "${var.project_name}-eks"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.eks_version

  # Restrict API exposure + enable private endpoint
  vpc_config {
    subnet_ids              = [data.aws_subnet.eu_central_1a.id, data.aws_subnet.eu_central_1b.id]
    endpoint_private_access = true
    endpoint_public_access  = true
    security_group_ids      = [aws_security_group.eks_cluster.id]
    public_access_cidrs     = local.public_cidrs
  }

  # Control plane logs -> CloudWatch
  enabled_cluster_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  # Secrets envelope encryption
  encryption_config {
    provider { key_arn = aws_kms_key.eks.arn }
    resources = ["secrets"]
  }

  # Guardrail against accidental deletion
  deletion_protection = true

  tags = { Name = "${var.project_name}-eks" }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_AmazonEKSClusterPolicy,
    aws_iam_role_policy_attachment.eks_cluster_AmazonEKSVPCResourceController,
    aws_cloudwatch_log_group.eks
  ]

  lifecycle {
    precondition {
      condition     = length(local.public_cidrs) > 0
      error_message = "EKS public_access_cidrs must not be empty. Populate SSM ${var.eks_api_allowed_cidrs_ssm_name} or set var.api_allowed_cidrs."
    }
  }
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
  ami_type       = "AL2023_x86_64_STANDARD"
  version        = var.eks_version

  update_config { max_unavailable = 1 }

  tags = { Name = "${var.project_name}-ng" }

  depends_on = [aws_eks_cluster.this]
}

# EKS data sources (for providers)
data "aws_eks_cluster" "this" {
  name       = aws_eks_cluster.this.name
  depends_on = [aws_eks_cluster.this]
}

data "aws_eks_cluster_auth" "this" {
  name = aws_eks_cluster.this.name
}
