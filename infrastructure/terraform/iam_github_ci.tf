############################################################
# GitHub OIDC provider + CI role (ECR push + EKS describe)
############################################################

variable "github_repo_owner" { type = string, default = "YOUR_GH_OWNER" } # <--- change
variable "github_repo_name"  { type = string, default = "Scheduler-v3" }   # <--- change
variable "ecr_repo_frontend" { type = string, default = "frontend" }

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# GitHub OIDC identity provider (create once per account)
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # Known stable thumbprint for GitHub's OpenID (DigiCert root)
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# CI role assumed by GitHub Actions
resource "aws_iam_role" "ci" {
  name = "${var.project_name}-ci"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Sid = "GitHubOIDC",
      Effect = "Allow",
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn },
      Action = "sts:AssumeRoleWithWebIdentity",
      Condition = {
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo_owner}/${var.github_repo_name}:*"
        },
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
  tags = { Name = "${var.project_name}-ci" }
}

# Limit ECR to the specific repo
data "aws_ecr_repository" "frontend" {
  name = var.ecr_repo_frontend
}

resource "aws_iam_role_policy" "ci_policy" {
  name = "${var.project_name}-ci-ecr-eks"
  role = aws_iam_role.ci.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "ECRPushPull",
        Effect = "Allow",
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ],
        Resource = data.aws_ecr_repository.frontend.arn
      },
      {
        Sid     = "DescribeCluster",
        Effect  = "Allow",
        Action  = ["eks:DescribeCluster"],
        Resource = "*"
      }
    ]
  })
}
