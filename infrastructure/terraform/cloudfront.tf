##############################
# CloudFront distribution (SPA + API routing)
# - S3 origin (private) with OAC
# - Optional API origin routed at /api/*
# - Viewer cert in us-east-1 (aws_acm_certificate.origin)
##############################

# --------
# OAC for S3
# --------
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.app_prefix}-frontend-oac"
  description                       = "OAC for ${var.app_prefix}-frontend S3 origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------
# CloudFront Distribution
# ---------------
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "Frontend SPA + API routing to ALB"
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  # If you define this elsewhere as local.frontend_hostname, keep it.
  # Otherwise, ensure the local exists: local.frontend_hostname = "www.${var.root_domain}"
  aliases = [local.frontend_hostname]

  # ---------------
  # Origins
  # ---------------
  origin {
    origin_id                = "s3-frontend-origin"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # API origin (HTTPS to your regional API endpoint / ALB via DNS name)
  origin {
    origin_id   = "api-origin"
    domain_name = local.api_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # -------------------------
  # Behaviors
  # -------------------------

  # Default behavior → S3 (SPA)
  default_cache_behavior {
    target_origin_id       = "s3-frontend-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    compress = true

    # AWS managed policies
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
    origin_request_policy_id   = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # CORS-S3Origin
    response_headers_policy_id = "eaab4381-ed33-4a86-88ca-d9558dc6cd63" # CORS-With-Preflight
  }

  # Route API paths to API origin (disable caching)
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "api-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD"]

    compress = true

    cache_policy_id            = "413f1604-3beb-4f5a-bbdf-00a4f4f68a47" # CachingDisabled
    origin_request_policy_id   = "5cc3b908-e619-4b99-88e5-2cf7f05975a4" # AllViewer
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03" # SecurityHeadersPolicy
  }

  # ---------------
  # Error responses (SPA routing)
  # ---------------
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

  # ---------------
  # Price class / geo
  # ---------------
  price_class = "PriceClass_100"

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # ---------------
  # TLS certificate (us-east-1)
  # ---------------
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.origin.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # Ensure CF is only created after the cert is validated and OAC exists
  depends_on = [
    aws_acm_certificate_validation.origin,
    aws_cloudfront_origin_access_control.frontend
  ]

  # Avoid apply failures when CF was deleted out-of-band and tags would be "updated"
  lifecycle {
    ignore_changes = [tags]
  }

  tags = {
    App = var.app_prefix
  }
}
