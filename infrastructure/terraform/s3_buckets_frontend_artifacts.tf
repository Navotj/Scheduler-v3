############################################################
# Frontend + Artifacts buckets
############################################################

# Frontend S3 bucket (private; will be read via CloudFront OAI)
resource "aws_s3_bucket" "frontend" {
  bucket        = var.domain_name
  force_destroy = false
  tags          = { Name = var.domain_name }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration { status = "Enabled" }
}

# Private S3 bucket for deployment artifacts
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
  rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
}

resource "aws_s3_bucket_lifecycle_configuration" "deploy_artifacts" {
  bucket = aws_s3_bucket.deploy_artifacts.id

  rule {
    id     = "expire-backend-artifacts-1d"
    status = "Enabled"
    filter { prefix = "backend/" }
    expiration { days = 1 }
    noncurrent_version_expiration { noncurrent_days = 1 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}
