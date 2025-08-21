############################################################
# GitHub OIDC + CI Role for Navotj/Scheduler-v3
# Grants:
# - ECR push/pull to "frontend"
# - eks:DescribeCluster (to build kubeconfig)
#
# Output:
# - github_ci_role_arn
############################################################

variable "github_repo_owner" {
  description = "GitHub owner/org"
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

# Reuse your existing data sources (declared in data.tf):
# data "aws_caller_identity" "current" {}
# data "aws_region" "current" {}

# Fetch thumbprint dynamically
data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # Use the first certificate's SHA1; AWS accepts this pattern for GitHub OIDC.
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]

  tags = {
    Name = "${var.project_name}-github-oidc"
  }
}

# Trust policy for the CI role (scoped to this repo)
data "aws_iam_policy_document" "github_ci_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Allow any workflow in this repo (owner/repo:*).
    # If you want to scope further (env/protected tags), we can tighten this later.
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
  tags = {
    Name = "${var.project_name}-github-ci"
  }
}

# Inline policy: ECR push/pull (to the frontend repo) + DescribeCluster
data "aws_iam_policy_document" "github_ci_inline" {
  statement {
    sid     = "EcrToken"
    effect  = "Allow"
    actions = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid     = "EcrPushPullFrontend"
    effect  = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:DescribeRepositories",
      "ecr:GetDownloadUrlForLayer",
      "ecr:GetRepositoryPolicy",
      "ecr:InitiateLayerUpload",
      "ecr:ListImages",
      "ecr:PutImage",
      "ecr:UploadLayerPart"
    ]
    resources = [
      "arn:aws:ecr:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:repository/${var.ecr_repo_frontend}"
    ]
  }

  statement {
    sid     = "EksDescribeCluster"
    effect  = "Allow"
    actions = ["eks:DescribeCluster"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_ci_inline" {
  name   = "${var.project_name}-github-ci-inline"
  policy = data.aws_iam_policy_document.github_ci_inline.json
}

resource "aws_iam_role_policy_attachment" "github_ci_attach_inline" {
  role       = aws_iam_role.github_ci.name
  policy_arn = aws_iam_policy.github_ci_inline.arn
}

output "github_ci_role_arn" {
  description = "IAM Role ARN for GitHub Actions OIDC (set as AWS_ROLE_TO_ASSUME secret in GitHub)"
  value       = aws_iam_role.github_ci.arn
}
