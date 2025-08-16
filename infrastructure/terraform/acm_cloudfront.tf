############################################################
# CloudFront (Frontend + API routing)
# - Default origin: S3 static site (via OAC)
# - API paths -> ALB origin with cookies/headers/query forwarded
# - SPA fallback for 403/404 to /index.html
############################################################

# ---------- Managed policies ----------
data "aws_cloudfront_cache_policy" "managed_caching_optimized" {
  id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
}

data "aws_cloudfront_cache_policy" "managed_caching_disabled" {
  id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
}

data "aws_cloudfront_origin_request_policy" "managed_all_viewer" {
  id = "216adef6-5c7f-47e4-b989-5492eafa07d3" # AllViewer
}

# ---------- ACM certificate in us-east-1 (for CloudFront) ----------
# Requires provider alias aws.us_east_1 to be configured elsewhere in the module.
data "aws_acm_certificate" "frontend" {
  provider     = aws.us_east_1
  domain       = "nat20scheduling.com"
  most_recent  = true
  statuses     = ["ISSUED"]
  types        = ["AMAZON_ISSUED"]
}

# ---------- Lookup the existing ALB by name ----------
# Name derived from AWS console/ARN: nat20-backend-alb
data "aws_lb" "backend" {
  name = "nat20-backend-alb"
}

# ---------- Origin Access Control for S3 (OAC) ----------
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "frontend-oac"
  description                       = "OAC for CloudFront to access S3 frontend bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------- CloudFront Distribution ----------
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "nat20scheduling.com frontend"
  default_root_object = "index.html"

  aliases = [
    "nat20scheduling.com",
    "www.nat20scheduling.com",
  ]

  # ---------- Origins ----------
  # S3 static site (via OAC)
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id

    s3_origin_config {
      # OAC path: keep empty OAI reference
      origin_access_identity = ""
    }
  }

  # ALB origin for API
  origin {
    domain_name = data.aws_lb.backend.dns_name
    origin_id   = "alb-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      # Use http-only unless the ALB listener/cert matches the origin hostname
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # ---------- Default behavior (S3) ----------
  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD", "OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_optimized.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id

    compress = true
  }

  # ---------- Ordered behaviors (API -> ALB) ----------
  ordered_cache_behavior {
    path_pattern           = "/auth/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods  = ["GET","HEAD","OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern           = "/users/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods  = ["GET","HEAD","OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern           = "/availability/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods  = ["GET","HEAD","OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern           = "/settings"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods  = ["GET","HEAD","OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern           = "/settings/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods  = ["GET","HEAD","OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern           = "/login"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods  = ["GET","HEAD","OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern           = "/logout"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods  = ["GET","HEAD","OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern           = "/health"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET","HEAD","OPTIONS"]
    cached_methods  = ["GET","HEAD","OPTIONS"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
  }

  # ---------- SPA fallback ----------
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

  # ---------- Price class & geo ----------
  price_class = "PriceClass_All"

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # ---------- TLS ----------
  viewer_certificate {
    acm_certificate_arn      = data.aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name = "nat20-frontend-cf"
  }
}
