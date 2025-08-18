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

# ---------- ACM certificate for CloudFront (us-east-1) ----------
# Requires provider alias aws.us_east_1 to be configured elsewhere.
resource "aws_acm_certificate" "frontend" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "frontend-cert-${var.domain_name}"
  }
}

# DNS validation records for the ACM cert
resource "aws_route53_record" "frontend_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.frontend.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

# Validate the certificate
resource "aws_acm_certificate_validation" "frontend" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for r in aws_route53_record.frontend_cert_validation : r.fqdn]
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

# ---------- Custom Origin Request Policy for API ----------
# Forwards ALL cookies and ALL query strings, and only needed headers.
# (Avoids forwarding Host; does NOT include Authorization which CF rejects.)
resource "aws_cloudfront_origin_request_policy" "api_all_cookies" {
  name = "api-all-cookies-all-qs-no-host"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "Accept",
        "Accept-Language",
        "Content-Type",
        "Origin",
        "Referer",
        "User-Agent",
        "Access-Control-Request-Headers",
        "Access-Control-Request-Method"
      ]
    }
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

# ---------- CloudFront Distribution ----------
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Frontend SPA + API routing"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  aliases = [
    var.domain_name,
  ]

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # IMPORTANT: Use HTTPS to the API origin and target the custom DNS name
  # so the ALB's ACM cert (eu-central-1) matches the SNI hostname.
  origin {
    domain_name = "api.${var.domain_name}"  # do NOT point to CloudFront/apex; this must resolve to the ALB
    origin_id   = "alb-origin"

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 15
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
    path_pattern           = "/auth/check"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
  }

  ordered_cache_behavior {
    path_pattern           = "/check"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
  }

  ordered_cache_behavior {
    path_pattern           = "/auth/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
  }

  ordered_cache_behavior {
    path_pattern           = "/availability/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
  }

  # API exact path /settings -> ALB
  ordered_cache_behavior {
    path_pattern           = "/settings"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
  }

  # API prefix /settings/* -> ALB
  ordered_cache_behavior {
    path_pattern           = "/settings/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
  }

  ordered_cache_behavior {
    path_pattern           = "/users/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
  }

  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
  }

  # ---------- Error responses (SPA fallback) ----------
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

  # ---------- Restrictions (required block) ----------
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # ---------- TLS ----------
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name = "nat20-frontend-cf"
  }
}
