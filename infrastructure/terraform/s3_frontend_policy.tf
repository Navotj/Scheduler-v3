############################################################
# S3 bucket policy for frontend (OAC + legacy OAI + TLS-only)
# Grants CloudFront access to private S3 via OAC and keeps
# legacy OAI readable during migration to avoid downtime.
############################################################

data "aws_iam_policy_document" "frontend_bucket_policy" {
  # Allow CloudFront via OAC (service principal) for this distribution
  statement {
    sid     = "AllowCloudFrontReadViaOAC"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }

  # Allow legacy OAI (kept during migration)
  statement {
    sid     = "AllowCloudFrontReadViaOAI"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "CanonicalUser"
      identifiers = [aws_cloudfront_origin_access_identity.frontend.s3_canonical_user_id]
    }
  }

  # Defense-in-depth: require TLS for any S3 access
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.frontend.arn,
      "${aws_s3_bucket.frontend.arn}/*"
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend_oai" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket_policy.json
}
