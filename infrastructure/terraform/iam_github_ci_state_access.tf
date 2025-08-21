#############################################
# CI access to the Terraform remote state S3
#############################################

variable "tf_state_bucket" {
  description = "S3 bucket that stores Terraform state"
  type        = string
  default     = "navot-terraform-state-1"
}

# Optional: if your backend uses a key prefix like "prod/terraform.tfstate".
# Leave empty to target the bucket root object(s).
variable "tf_state_key_prefix" {
  description = "Key prefix under the state bucket (without leading or trailing slash). Example: prod"
  type        = string
  default     = ""
}

# GitHub OIDC role that runs Terraform (from your outputs)
variable "ci_role_arn" {
  description = "GitHub Actions OIDC role that should be able to read/write state"
  type        = string
  default     = "arn:aws:iam::637423477802:role/nat20-github-ci"
}

locals {
  # Normalize prefix (no leading/trailing slashes)
  state_prefix = trim(var.tf_state_key_prefix, "/")

  # Build an object-level ARN without conditionals by collapsing the double slash
  # If prefix is empty => arn:aws:s3:::bucket/* ; else => arn:aws:s3:::bucket/prefix/*
  state_object_arn = replace(
    "arn:aws:s3:::${var.tf_state_bucket}//${local.state_prefix}/*",
    "//",
    "/"
  )
}

data "aws_iam_policy_document" "state_bucket_policy" {
  statement {
    sid    = "AllowCiListBucket"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = [var.ci_role_arn]
    }
    actions   = ["s3:ListBucket", "s3:GetBucketLocation", "s3:ListBucketVersions"]
    resources = ["arn:aws:s3:::${var.tf_state_bucket}"]
  }

  statement {
    sid    = "AllowCiRWStateObjects"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = [var.ci_role_arn]
    }
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucketMultipartUploads",
      "s3:AbortMultipartUpload"
    ]
    resources = [local.state_object_arn]
  }
}

resource "aws_s3_bucket_policy" "state_bucket" {
  bucket = var.tf_state_bucket
  policy = data.aws_iam_policy_document.state_bucket_policy.json
}
