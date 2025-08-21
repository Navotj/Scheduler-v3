############################################################
# GitHub OIDC + CI Role for this repo
# Owner: Navotj, Repo: Scheduler-v3
# Policies: AmazonEKSClusterPolicy, AmazonEC2ReadOnlyAccess,
#           and a tiny managed policy for eks:UpdateClusterConfig + describe.
############################################################

variable "github_repo_owner" {
  type        = string
  description = "GitHub org/user that owns the repo"
  default     = "Navotj"
}

variable "github_repo_name" {
  type        = string
  description = "GitHub repository name"
  default     = "Scheduler-v3"
}

# Uses existing data sources from data.tf:
# data "aws_caller_identity" "current" {}
# data "aws_region" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b7aa9c2e0fbb0b98e37"
  ]
  tags = { Name = "${var.project_name}-github-oidc" }
}

data "aws_iam_policy_document" "github_ci_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo_owner}/${var.github_repo_name}:*"]
    }
  }
}

resource "aws_iam_role" "github_ci" {
  name               = "${var.project_name}-github-ci"
  assume_role_policy = data.aws_iam_policy_document.github_ci_trust.json
  tags               = { Name = "${var.project_name}-github-ci" }
}

# Attach the AWS-managed policies you already added by hand
resource "aws_iam_role_policy_attachment" "github_ci_eks" {
  role       = aws_iam_role.github_ci.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_iam_role_policy_attachment" "github_ci_ec2ro" {
  role       = aws_iam_role.github_ci.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess"
}

# Minimal extra rights Terraform needs to update the cluster API settings
data "aws_iam_policy_document" "ci_eks_updates" {
  statement {
    sid     = "EKSClusterUpdate"
    effect  = "Allow"
    actions = [
      "eks:UpdateClusterConfig",
      "eks:DescribeCluster",
      "eks:DescribeUpdate",
      "eks:ListClusters",
      "eks:ListUpdates"
    ]
    # Scope to all clusters; tighten later if you want to build the exact ARN.
    resources = ["*"]
  }
}

resource "aws_iam_policy" "ci_eks_updates" {
  name        = "${var.project_name}-ci-eks-updates"
  description = "Allow CI to call eks:UpdateClusterConfig and related describe/list"
  policy      = data.aws_iam_policy_document.ci_eks_updates.json
}

resource "aws_iam_role_policy_attachment" "github_ci_eks_updates" {
  role       = aws_iam_role.github_ci.name
  policy_arn = aws_iam_policy.ci_eks_updates.arn
}

output "github_ci_role_arn" {
  value       = aws_iam_role.github_ci.arn
  description = "IAM Role ARN that GitHub Actions (OIDC) should assume"
}
