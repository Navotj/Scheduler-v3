############################################################
# GitHub OIDC CI role access (Terraform backend + bootstrap)
# - Attaches backend access (S3 state + DynamoDB lock)
# - Attaches ReadOnlyAccess so data sources can be planned
# - Attaches AdministratorAccess (bootstrap; can be replaced later)
############################################################

# These already exist elsewhere; do NOT redeclare there.
# data "aws_caller_identity" "current" {}
# data "aws_region" "current" {}

variable "ci_role_name" {
  description = "IAM role name for GitHub Actions OIDC that runs Terraform"
  type        = string
  default     = "nat20-github-ci"
}

variable "tf_state_bucket" {
  description = "S3 bucket that stores terraform.tfstate"
  type        = string
  default     = "navot-terraform-state-1"
}

variable "tf_state_key_prefix" {
  description = "Optional key prefix/folder where state lives; leave empty if at bucket root"
  type        = string
  default     = ""
}

variable "tf_lock_table_name" {
  description = "DynamoDB table name used for Terraform state locking"
  type        = string
  default     = "terraform-lock-table"
}

# Look up the existing CI role so we can attach policies to it
data "aws_iam_role" "ci" {
  name = var.ci_role_name
}

locals {
  state_bucket_arn = "arn:aws:s3:::${var.tf_state_bucket}"
  state_prefix     = trim(var.tf_state_key_prefix, "/")

  # If no prefix -> arn:aws:s3:::bucket/* ; else -> arn:aws:s3:::bucket/prefix/*
  state_objects_arn = length(local.state_prefix) == 0
    ? "${local.state_bucket_arn}/*"
    : "${local.state_bucket_arn}/${local.state_prefix}/*"

  lock_table_arn = "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${var.tf_lock_table_name}"
}

# One policy with both S3 (state) and DynamoDB (lock) permissions
data "aws_iam_policy_document" "ci_backend_access" {
  # S3: list bucket (backend needs this)
  statement {
    sid     = "S3ListBucket"
    effect  = "Allow"
    actions = ["s3:ListBucket", "s3:GetBucketLocation", "s3:ListBucketVersions"]
    resources = [local.state_bucket_arn]

    # Optional: restrict listing to the prefix if one is used
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values = [
        length(local.state_prefix) == 0 ? "*" : "${local.state_prefix}/*"
      ]
    }
  }

  # S3: read/write/delete state objects
  statement {
    sid     = "S3RWStateObjects"
    effect  = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucketMultipartUploads",
      "s3:AbortMultipartUpload"
    ]
    resources = [local.state_objects_arn]
  }

  # DynamoDB: use the lock table (include Scan so you can nuke locks via workflow)
  statement {
    sid     = "DynamoDBStateLock"
    effect  = "Allow"
    actions = [
      "dynamodb:DescribeTable",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Scan"
    ]
    resources = [local.lock_table_arn]
  }
}

resource "aws_iam_policy" "ci_backend_access" {
  name        = "${var.project_name}-ci-backend-access"
  description = "Permit Terraform CI to read/write S3 state and use DynamoDB state lock"
  policy      = data.aws_iam_policy_document.ci_backend_access.json
}

resource "aws_iam_role_policy_attachment" "ci_attach_backend_access" {
  role       = data.aws_iam_role.ci.name
  policy_arn = aws_iam_policy.ci_backend_access.arn
}

# Keep plans from failing on new data sources (VPC/Subnets/etc.)
resource "aws_iam_role_policy_attachment" "github_ci_readonly" {
  role       = data.aws_iam_role.ci.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# Bootstrap convenience; we can replace with least-privileged sets later
resource "aws_iam_role_policy_attachment" "github_ci_admin" {
  role       = data.aws_iam_role.ci.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
