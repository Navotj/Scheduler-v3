######################################################
# Allow the GitHub OIDC CI role to use the TF lock table
######################################################

# Name of the existing DynamoDB table used by the backend for locking
variable "tf_lock_table_name" {
  description = "DynamoDB table name used for Terraform state locking"
  type        = string
  default     = "terraform-lock-table"
}

# Name of the CI role that runs Terraform (already created; output earlier)
variable "ci_role_name" {
  description = "IAM role name for GitHub Actions OIDC that runs Terraform"
  type        = string
  default     = "nat20-github-ci"
}

# We already have these data sources in data.tf; reuse them here.
# data "aws_caller_identity" "current" {}
# data "aws_region" "current"     {}

# Look up the existing CI role by name so we can attach a policy to it
data "aws_iam_role" "ci" {
  name = var.ci_role_name
}

locals {
  lock_table_arn = "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${var.tf_lock_table_name}"
}

data "aws_iam_policy_document" "tf_lock_access" {
  statement {
    sid     = "AllowStateLocking"
    effect  = "Allow"
    actions = [
      "dynamodb:DescribeTable",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem"
    ]
    resources = [local.lock_table_arn]
  }
}

resource "aws_iam_policy" "tf_lock_access" {
  name        = "${var.project_name}-tf-lock-access"
  description = "Permit Terraform CI role to use DynamoDB state lock table"
  policy      = data.aws_iam_policy_document.tf_lock_access.json
}

resource "aws_iam_role_policy_attachment" "ci_tf_lock_access" {
  role       = data.aws_iam_role.ci.name
  policy_arn = aws_iam_policy.tf_lock_access.arn
}
