##############################
# S3 bucket for frontend artifacts (private; OAC via CloudFront)
##############################

resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.app_prefix}-frontend"
  force_destroy = false

  tags = {
    Name        = "${var.app_prefix}-frontend"
    App         = var.app_prefix
    Terraform   = "true"
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    id     = "frontend-lifecycle"
    status = "Enabled"

    # Apply to the entire bucket (required by provider)
    filter {
      prefix = ""
    }

    # Keep or adjust to your preference; safe housekeeping
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket_policy.json
}
