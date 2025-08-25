# IAM for backend (SSM + S3 artifacts read)

resource "aws_iam_role" "backend_role" {
  name               = "${var.app_prefix}-backend-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Name = "${var.app_prefix}-backend-role"
  }
}

resource "aws_iam_instance_profile" "backend_profile" {
  name = "${var.app_prefix}-backend-instance-profile"
  role = aws_iam_role.backend_role.name
}

resource "aws_iam_role_policy_attachment" "backend_ssm_core" {
  role       = aws_iam_role.backend_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_policy" "backend_artifacts_read" {
  name        = "${var.app_prefix}-backend-artifacts-read"
  description = "Allow backend instance to read deployment artifacts from S3"
  policy      = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.app_prefix}-artifacts"
      },
      {
        Sid      = "GetObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${var.app_prefix}-artifacts/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "backend_artifacts_attach" {
  role       = aws_iam_role.backend_role.name
  policy_arn = aws_iam_policy.backend_artifacts_read.arn
}


# Strict OAC-only read policy (no ListBucket needed)
data "aws_iam_policy_document" "frontend_bucket_policy" {
  statement {
    sid = "AllowCloudFrontOACRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions = [
      "s3:GetObject"
    ]

    resources = [
      "${aws_s3_bucket.frontend.arn}/*"
    ]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }

  # Optional: deny unencrypted uploads (defensive; no uploads expected from web)
  statement {
    sid     = "DenyUnencryptedObjectUploads"
    effect  = "Deny"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.frontend.arn}/*"
    ]
    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["AES256"]
    }
    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }
}
