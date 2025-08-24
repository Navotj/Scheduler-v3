# S3 bucket for Terraform state
resource "aws_s3_bucket" "tfstate" {
  bucket        = "${var.app_prefix}-state-bucket" # must be globally-unique, lowercase, no underscores
  force_destroy = false

  tags = {
    Name        = "${var.app_prefix}-tfstate"
    App         = var.app_prefix
    Terraform   = "true"
    ManagedBy   = "terraform"
    Environment = "prod"
  }
}

# Enforce bucket-owner-only control (no ACLs). Required/best-practice for modern S3.
resource "aws_s3_bucket_ownership_controls" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Keep object history of your tfstate (for recovery)
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption at rest
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Lifecycle: keep versions manageable (cost control) + clean up failed uploads
resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    id     = "noncurrent-expiration"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  rule {
    id     = "abort-mpu"
    status = "Enabled"
    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# DynamoDB table for state locking (name aligned with deploy workflow)
resource "aws_dynamodb_table" "locks" {
  name         = "${var.app_prefix}-tf-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "${var.app_prefix}-tf-locks"
    App         = var.app_prefix
    Terraform   = "true"
    ManagedBy   = "terraform"
    Environment = "prod"
  }
}

output "state_bucket_name" {
  value       = aws_s3_bucket.tfstate.bucket
  description = "S3 bucket name for Terraform remote state"
}

output "lock_table_name" {
  value       = aws_dynamodb_table.locks.name
  description = "DynamoDB table name for Terraform state locking"
}
