############################################################
# Attach S3 (and optional DynamoDB/KMS) permissions to the
# existing GitHub OIDC role used by CI: nat20-github-ci
#
# Assumes the role already exists (you have:
#   github_ci_role_arn = arn:aws:iam::637423477802:role/nat20-github-ci )
############################################################

variable "ci_role_name" {
  description = "Name of the existing GitHub CI role to attach policies to"
  type        = string
  default     = "nat20-github-ci"
}

variable "tf_state_bucket" {
  description = "S3 bucket that stores terraform.tfstate"
  type        = string
  default     = "navot-terraform-state-1"
}

variable "tf_state_key_prefix" {
  description = "Optional key prefix inside the bucket (e.g. infrastructure/terraform/). Leave empty if state is at bucket root."
  type        = string
  default     = ""
}

variable "tf_lock_table" {
  description = "OPTIONAL DynamoDB table name for state locking. Leave empty if not used."
  type        = string
  default     = ""
}

variable "tf_state_kms_key_arn" {
  description = "OPTIONAL KMS key ARN if bucket uses SSE-KMS (not needed for SSE-S3). Leave empty if not used."
  type        = string
  default     = ""
}

# Look up the existing role by name (created elsewhere)
data "aws_iam_role" "ci" {
  name = var.ci_role_name
}

# ---- S3 state bucket access ----
locals {
  state_objects_arn = length(var.tf_state_key_prefix) > 0
    ? "arn:aws:s3:::${var.tf_state_bucket}/${trim(var.tf_state_key_prefix, "/")}/*"
    : "arn:aws:s3:::${var.tf_state_bucket}/*"
}

data "aws_iam_policy_document" "tf_state_access" {
  statement {
    sid     = "ListStateBucket"
    effect  = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation"
    ]
    resources = ["arn:aws:s3:::${var.tf_state_bucket}"]
  }

  statement {
    sid     = "RWStateObjects"
    effect  = "Allow"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:ListBucketMultipartUploads",
      "s3:ListMultipartUploadParts",
      "s3:PutObjectTagging",
      "s3:GetObjectTagging"
    ]
    resources = [local.state_objects_arn]
  }
}

resource "aws_iam_policy" "tf_state_access" {
  name        = "${var.project_name}-tf-state-access"
  description = "Permit CI to read/write Terraform state in S3"
  policy      = data.aws_iam_policy_document.tf_state_access.json
}

resource "aws_iam_role_policy_attachment" "ci_tf_state" {
  role       = data.aws_iam_role.ci.name
  policy_arn = aws_iam_policy.tf_state_access.arn
}

# ---- OPTIONAL: DynamoDB state lock table ----
# Only created/attached if you set var.tf_lock_table != ""
data "aws_iam_policy_document" "tf_lock" {
  count = var.tf_lock_table != "" ? 1 : 0

  statement {
    sid     = "TFStateLockTable"
    effect  = "Allow"
    actions = [
      "dynamodb:DescribeTable",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:UpdateItem"
    ]
    resources = [
      "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${var.tf_lock_table}"
    ]
  }
}

resource "aws_iam_policy" "tf_lock" {
  count       = var.tf_lock_table != "" ? 1 : 0
  name        = "${var.project_name}-tf-lock-access"
  description = "Permit CI to use DynamoDB table for Terraform state locking"
  policy      = data.aws_iam_policy_document.tf_lock[0].json
}

resource "aws_iam_role_policy_attachment" "ci_tf_lock" {
  count      = var.tf_lock_table != "" ? 1 : 0
  role       = data.aws_iam_role.ci.name
  policy_arn = aws_iam_policy.tf_lock[0].arn
}

# ---- OPTIONAL: KMS for SSE-KMS on state bucket ----
# Only created/attached if you set var.tf_state_kms_key_arn != ""
data "aws_iam_policy_document" "tf_state_kms" {
  count = var.tf_state_kms_key_arn != "" ? 1 : 0

  statement {
    sid     = "AllowKmsForState"
    effect  = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:GenerateDataKey",
      "kms:DescribeKey"
    ]
    resources = [var.tf_state_kms_key_arn]
  }
}

resource "aws_iam_policy" "tf_state_kms" {
  count       = var.tf_state_kms_key_arn != "" ? 1 : 0
  name        = "${var.project_name}-tf-state-kms"
  description = "Permit CI to use the KMS key for Terraform state"
  policy      = data.aws_iam_policy_document.tf_state_kms[0].json
}

resource "aws_iam_role_policy_attachment" "ci_tf_state_kms" {
  count      = var.tf_state_kms_key_arn != "" ? 1 : 0
  role       = data.aws_iam_role.ci.name
  policy_arn = aws_iam_policy.tf_state_kms[0].arn
}
