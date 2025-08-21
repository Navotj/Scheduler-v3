############################################################
# CI role access to Terraform backend (S3 state + DynamoDB lock)
# Attaches ONE policy to the existing GitHub OIDC role (nat20-github-ci)
############################################################

# These two data sources already exist in your data.tf.
# Do NOT re-declare them anywhere else to avoid duplicates.
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
  description = "Optional key prefix/folder under which state lives (leave empty if state is at bucket root)"
  type        = string
  default     = ""
}

variable "tf_lock_table_name" {
  description = "DynamoDB table name used for Terraform state locking"
  type        = string
  default     = "terraform-lock-table"
}

# Look up the CI role so we can attach a policy
data "aws_iam_role" "ci" {
  name = var.ci_role_name
}

# Build ARNs for the backend resources
locals {
  state_bucket_arn  = "arn:aws:s3:::${var.tf_state_bucket}"
  # If no prefix provided -> allow entire bucket objects; else bucket/prefix/*
  state_objects_arn = length(trim(var.tf_state_key_prefix)) == 0
    ? "${local.state_bucket_arn}/*"
    : "${local.state_bucket_arn}/${trim(var.tf_state_key_prefix, "/")}/*"

  lock_table_arn = "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${var.tf_lock_table_name}"
}

# One policy with both S3 (state) and DynamoDB (lock) permissions
data "aws_iam_policy_document" "ci_backend_access" {
  # S3: list the bucket (needed by the backend)
  statement {
    sid     = "S3ListBucket"
    effect  = "Allow"
    actions = ["s3:ListBucket"]
    resources = [
      local.state_bucket_arn
    ]
    # Optional: restrict listing to the prefix if you use one
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = [
        length(trim(var.tf_state_key_prefix)) == 0 ? "*" : "${trim(var.tf_state_key_prefix, "/")}/*"
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
      "s3:DeleteObject"
    ]
    resources = [local.state_objects_arn]
  }

  # DynamoDB: use the lock table (include Scan to support manual unlock workflow)
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
