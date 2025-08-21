############################################################
# GitHub Actions OIDC -> IAM Role for CI (ECR + EKS access)
# - Creates the GitHub OIDC provider in IAM
# - IAM Role trusted by GitHub OIDC (branch: main by default)
# - Minimal permissions: ECR push to a specific repo + EKS Describe
# - Adds an EKS Access Entry to grant cluster-admin on this cluster
#
# NOTE:
# - Uses data.aws_caller_identity.current and data.aws_region.current
#   which you already define in data.tf (no duplicates here).
# - No changes needed in eks.tf; the Access Entry wires RBAC.
############################################################

##########################
# Inputs
##########################

variable "github_repo_owner" {
  description = "GitHub org/user that owns the repository"
  type        = string
  default     = "Navotj"
}

variable "github_repo_name" {
  description = "GitHub repository name"
  type        = string
  default     = "Scheduler-v3"
}

variable "ecr_repo_frontend" {
  description = "ECR repository name for the frontend image"
  type        = string
  default     = "frontend"
}

# Optional: which branch(es) can assume the role via OIDC.
# The 'sub' claim format is: repo:<owner>/<repo>:ref:refs/heads/<branch>
variable "github_allowed_branches" {
  description = "List of Git refs (branches) allowed to assume the CI role"
  type        = list(string)
  default     = ["refs/heads/main"]
}

##########################
# Locals
##########################

locals {
  repo_full_name   = "${var.github_repo_owner}/${var.github_repo_name}"
  oidc_url         = "token.actions.githubusercontent.com"
  # GitHub OIDC root CA thumbprint (DigiCert Global Root G2)
  # See GitHub docs: this is the current, stable thumbprint.
  github_thumbprint = "6938fd4d98bab03faadb97b34396831e3780aea1"

  # turn ["refs/heads/main","refs/heads/release-*"] into the required
  # StringLike patterns for the token 'sub' claim
  github_sub_patterns = [
    for ref in var.github_allowed_branches :
    "repo:${local.repo_full_name}:ref:${ref}"
  ]

  ecr_repo_arn = "arn:aws:ecr:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:repository/${var.ecr_repo_frontend}"
}

##########################
# GitHub OIDC Provider
##########################

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://${local.oidc_url}"

  client_id_list = ["sts.amazonaws.com"]

  # If GitHub rotates intermediates in the future, this may need updating.
  thumbprint_list = [local.github_thumbprint]

  tags = {
    Name = "github-oidc"
  }
}

##########################
# Trust policy for GitHub Actions
##########################

data "aws_iam_policy_document" "github_ci_trust" {
  statement {
    effect = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    actions = ["sts:AssumeRoleWithWebIdentity"]

    # Require the correct audience
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Restrict to specific repo + allowed refs (branches)
    condition {
      test     = "StringLike"
      variable = "${local.oidc_url}:sub"
      values   = local.github_sub_patterns
    }
  }
}

resource "aws_iam_role" "github_ci" {
  name               = "github-ci-${var.github_repo_owner}-${var.github_repo_name}"
  assume_role_policy = data.aws_iam_policy_document.github_ci_trust.json

  tags = {
    Name        = "github-ci-role"
    Repository  = local.repo_full_name
    ManagedBy   = "terraform"
  }
}

##########################
# Permissions: ECR + EKS Describe
##########################

# Minimal ECR push/pull for a single repository.
data "aws_iam_policy_document" "github_ci_ecr" {
  statement {
    sid     = "GetAuthToken"
    effect  = "Allow"
    actions = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # must be wildcard for this action
  }

  statement {
    sid    = "EcrWriteToFrontend"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:DescribeRepositories",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:ListImages"
    ]
    resources = [local.ecr_repo_arn]
  }
}

resource "aws_iam_policy" "github_ci_ecr" {
  name   = "github-ci-ecr-${var.github_repo_owner}-${var.github_repo_name}"
  policy = data.aws_iam_policy_document.github_ci_ecr.json
}

resource "aws_iam_role_policy_attachment" "github_ci_ecr_attach" {
  role       = aws_iam_role.github_ci.name
  policy_arn = aws_iam_policy.github_ci_ecr.arn
}

# EKS: allow update-kubeconfig to DescribeCluster (and ListClusters for UX)
data "aws_iam_policy_document" "github_ci_eks" {
  statement {
    sid     = "DescribeCluster"
    effect  = "Allow"
    actions = ["eks:DescribeCluster"]
    resources = [aws_eks_cluster.this.arn]
  }

  statement {
    sid       = "ListClusters"
    effect    = "Allow"
    actions   = ["eks:ListClusters"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_ci_eks" {
  name   = "github-ci-eks-${var.github_repo_owner}-${var.github_repo_name}"
  policy = data.aws_iam_policy_document.github_ci_eks.json
}

resource "aws_iam_role_policy_attachment" "github_ci_eks_attach" {
  role       = aws_iam_role.github_ci.name
  policy_arn = aws_iam_policy.github_ci_eks.arn
}

##########################
# Grant cluster-admin via EKS Access Entries
# (no need to edit aws-auth ConfigMap)
##########################

# Ensure the access entry exists for this principal
resource "aws_eks_access_entry" "github_ci" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.github_ci.arn

  # user: principal maps to a k8s user; could be 'rolearn' or 'userarn'
  # team/namespace scoping is handled by the policy association below.
  type = "STANDARD"

  depends_on = [aws_eks_cluster.this]
}

# Associate the built-in ClusterAdmin policy to the access entry
resource "aws_eks_access_policy_association" "github_ci_admin" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.github_ci.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.github_ci]
}

##########################
# Outputs
##########################

output "github_ci_role_arn" {
  description = "IAM Role ARN to be assumed by GitHub Actions"
  value       = aws_iam_role.github_ci.arn
}
