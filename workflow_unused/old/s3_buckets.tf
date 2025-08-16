###############################################
# Frontend S3 bucket (private; CloudFront OAC-only)
###############################################

resource "aws_s3_bucket" "frontend" {
  bucket        = var.domain_name
  force_destroy = false

  tags = {
    Name = var.domain_name
  }
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

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration { status = "Enabled" }
}

# ===================================================================
# CRITICAL: Allow ONLY CloudFront (OAC) to read objects from the bucket
# Uses distribution ARN so only YOUR distribution can read.
# ===================================================================
resource "aws_s3_bucket_policy" "frontend_oac" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      # Allow CloudFront distribution (via OAC) to GetObject
      {
        Sid      = "AllowCloudFrontReadViaOAC"
        Effect   = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      },
      # (Optional defense-in-depth) Deny any non-TLS access
      {
        Sid      = "DenyInsecureTransport"
        Effect   = "Deny"
        Principal = "*"
        Action   = "s3:*"
        Resource = [
          aws_s3_bucket.frontend.arn,
          "${aws_s3_bucket.frontend.arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })

  # Ensure the distribution exists so its ARN is resolvable
  depends_on = [aws_cloudfront_distribution.frontend]
}
