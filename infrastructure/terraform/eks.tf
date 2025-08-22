############################################################
# EKS Cluster + Managed Node Group (2 AZs, AL2023)
# Hardened: restricted API CIDRs, private endpoint enabled,
# control-plane logging (log group in cloudwatch_logs.tf),
# KMS envelope encryption (key/alias in kms_eks.tf).
############################################################

variable "eks_api_allowed_cidrs_ssm_name" {
  description = "SSM parameter name with comma-separated CIDRs allowed to the public EKS API endpoint"
  type        = string
  default     = "/nat20/network/EKS_API_ALLOWED_CIDRS"
}

variable "use_ssm_api_cidrs" {
  description = "If true, read API allowlist from SSM; if false, use var.api_allowed_cidrs"
  type        = bool
  default     = false
}

variable "api_allowed_cidrs" {
  description = "Explicit list of CIDRs when SSM is not used. Example: [\"198.51.100.10/32\",\"203.0.113.0/32\"]"
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "CloudWatch retention for EKS control plane logs"
  type        = number
  default     = 30
}

# Optionally read allowlist from SSM (guarded by 'use_ssm_api_cidrs')
data "aws_ssm_parameter" "eks_api_allowed_cidrs" {
  count           = var.use_ssm_api_cidrs ? 1 : 0
  name            = var.eks_api_allowed_cidrs_ssm_name
  with_decryption = false
}

# Fallback: detect current runner/bastion public IP to avoid opening API.
data "http" "runner_ip" {
  url = "https://checkip.amazonaws.com/"
}

locals {
  ssm_cidrs_raw  = var.use_ssm_api_cidrs && length(data.aws_ssm_parameter.eks_api_allowed_cidrs) > 0 ? data.aws_ssm_parameter.eks_api_allowed_cidrs[0].value : ""
  ssm_cidrs_list = length(trimspace(local.ssm_cidrs_raw)) > 0 ? [for c in split(",", local.ssm_cidrs_raw) : trimspace(c)] : []
  explicit_cidrs = var.api_allowed_cidrs
  runner_ip      = trimspace(data.http.runner_ip.response_body)
  runner_cidr    = can(regex("^\\d+\\.\\d+\\.\\d+\\.\\d+$", local.runner_ip)) ? ["${local.runner_ip}/32"] : []
  public_cidrs   = length(local.ssm_cidrs_list) > 0 ? local.ssm_cidrs_list : (length(local.explicit_cidrs) > 0 ? local.explicit_cidrs : local.runner_cidr)
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

resource "aws_eks_cluster" "this" {
  name     = "${var.project_name}-eks"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.eks_version

  vpc_config {
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.cluster_public_access_cidrs
    security_group_ids      = [aws_security_group.eks_cluster.id]
    subnet_ids              = [data.aws_subnet.eu_central_1a.id, data.aws_subnet.eu_central_1b.id]
  }

  enabled_cluster_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  encryption_config {
    provider { key_arn = aws_kms_key.eks.arn }
    resources = ["secrets"]
  }

  # ADD: enable EKS Access Entries API (keeps aws-auth working, too)
  access_config {
    authentication_mode                         = "API_AND_CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = true
  }

  tags = { Name = "${var.project_name}-eks" }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_AmazonEKSClusterPolicy,
    aws_iam_role_policy_attachment.eks_cluster_AmazonEKSVPCResourceController,
    aws_cloudwatch_log_group.eks
  ]

  lifecycle {
    ignore_changes = [
      # Avoid collisions with the workflow step that temporarily adds the runner IP
      vpc_config[0].public_access_cidrs
    ]
  }
}

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

# ADD: allow Session Manager access to nodes (no SSH user needed)
resource "aws_iam_role_policy_attachment" "eks_node_AmazonSSMManagedInstanceCore" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
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

  # Ensure AL2023 images
  ami_type = "AL2023_x86_64_STANDARD"

  # Pin node group to the cluster version so nodes roll with version bumps
  version = var.eks_version

  # Force a rollout even if only AMI/ami_type changed
  force_update_version = true

  update_config {
    max_unavailable = 1
  }

  tags = { Name = "${var.project_name}-ng" }

  depends_on = [
    aws_eks_cluster.this
  ]
}

data "aws_eks_cluster" "this" {
  name       = aws_eks_cluster.this.name
  depends_on = [aws_eks_cluster.this]
}

data "aws_eks_cluster_auth" "this" {
  name = aws_eks_cluster.this.name
}
