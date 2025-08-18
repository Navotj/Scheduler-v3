############################################################
# S3 bucket policy for frontend
# Allow BOTH:
#  - OAC (service principal + SourceArn of the distribution)
#  - LEGACY OAI (CanonicalUser) during migration
# Also deny non-TLS access.
############################################################

data "aws_iam_policy_document" "frontend_bucket_policy" {
  # Allow CloudFront via OAC
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

  # Allow legacy OAI (until fully cut over)
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

  # Defense-in-depth: require TLS
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
