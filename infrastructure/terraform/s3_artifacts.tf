###############################################
# Private S3 bucket for deployment artifacts
# - No public access
# - Encrypted
# - 1-day lifecycle expiry
###############################################

locals {
  artifacts_bucket_name = lower(replace("nat20scheduling-com-deploy-artifacts-${data.aws_caller_identity.current.account_id}", ".", "-"))
}

resource "aws_s3_bucket" "deploy_artifacts" {
  bucket        = local.artifacts_bucket_name
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "deploy_artifacts" {
  bucket                  = aws_s3_bucket.deploy_artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "deploy_artifacts" {
  bucket = aws_s3_bucket.deploy_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "deploy_artifacts" {
  bucket = aws_s3_bucket.deploy_artifacts.id

  rule {
    id     = "expire-backend-artifacts-1d"
    status = "Enabled"

    filter {
      prefix = "backend/"
    }

    expiration {
      days = 1
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
