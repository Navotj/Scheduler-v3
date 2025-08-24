##############################
# CloudFront distribution (SPA) in front of the private S3 bucket
# Uses OAC; bucket remains private. Viewer cert is the us-east-1 ACM cert.
##############################

# Origin Access Control for S3
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.app_prefix}-frontend-oac"
  description                       = "OAC for ${var.app_prefix}-frontend S3 origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront distribution for the SPA
resource "aws_cloudfront_distribution" "frontend" {
  comment             = "Frontend SPA + API routing to ALBs"
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_100"
  wait_for_deployment = true
  http_version        = "http2and3"

  # Serve apex + www (+ keep origin.<root_domain> working)
  aliases = [
    var.root_domain,
    "www.${var.root_domain}",
    local.origin_domain
  ]

  origin {
    origin_id                = "s3-${aws_s3_bucket.frontend.id}"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${aws_s3_bucket.frontend.id}"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    compress = true

    # Managed cache policy: CachingOptimized
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    # Managed origin request policy: AllViewer
    origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3"

    # Managed security headers policy
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03"
  }

  # SPA-friendly error mapping (serve index.html on 403/404)
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    # ACM cert in us-east-1; created in certs.tf as aws_acm_certificate.origin
    acm_certificate_arn            = aws_acm_certificate.origin.arn
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
    cloudfront_default_certificate = false
  }

  tags = {
    Name        = "${var.app_prefix}-frontend-cdn"
    App         = var.app_prefix
    Terraform   = "true"
    ManagedBy   = "terraform"
    Environment = "prod"
  }

  depends_on = [aws_cloudfront_origin_access_control.frontend]
}

# Bucket policy to allow CloudFront (via OAC) to read objects
data "aws_iam_policy_document" "frontend_allow_cloudfront" {
  statement {
    sid     = "AllowCloudFrontServiceGetObjectWithOAC"
    effect  = "Allow"
    actions = ["s3:GetObject"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend_allow_cloudfront" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_allow_cloudfront.json
}
