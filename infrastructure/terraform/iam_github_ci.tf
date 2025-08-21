############################################################
# GitHub OIDC + CI Role for this repo
# Owner: Navotj, Repo: Scheduler-v3
# Grants CI broad perms (AdministratorAccess) so TF can manage infra.
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

# Uses existing account/region data sources from data.tf:
# data "aws_caller_identity" "current" {}
# data "aws_region" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  # Current known thumbprints (GitHub root + intermediate). Ok to keep both.
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

    # Allow all refs (branches/tags) in Navotj/Scheduler-v3
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

# Broad perms so plan/apply can read/modify everything.
resource "aws_iam_role_policy_attachment" "github_ci_admin" {
  role       = aws_iam_role.github_ci.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "github_ci_role_arn" {
  value       = aws_iam_role.github_ci.arn
  description = "IAM Role ARN that GitHub Actions (OIDC) should assume"
}
