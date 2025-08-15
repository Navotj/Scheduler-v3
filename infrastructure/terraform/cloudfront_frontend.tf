###############################################
# CloudFront Distribution (Frontend + API via ALB)
# - S3 (OAC) for static site
# - Routes /auth/*, /availability/*, /users/*, /settings, /__debug/* to ALB
# - No caching on API; forward cookies/headers/query via Origin Request Policy
###############################################

resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "oac-${replace(var.domain_name, ".", "-")}"
  description                       = "OAC for ${var.domain_name} static site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Resolve external resources by name to avoid cross-file references
data "aws_lb" "backend" {
  name = var.backend_alb_name
}

data "aws_wafv2_web_acl" "frontend" {
  name  = var.frontend_waf_name
  scope = "CLOUDFRONT"
}


# ====================
# Policies
# ====================

# No-cache policy for API
resource "aws_cloudfront_cache_policy" "api_no_cache" {
  name        = "nat20-api-no-cache"
  comment     = "No caching for API responses"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 0

  # Required block in provider schema; set all to "none" to keep cache key empty.
  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = false
    enable_accept_encoding_gzip   = true

    headers_config {
      header_behavior = "none"
    }

    cookies_config {
      cookie_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# Forward everything the API needs at the origin request stage
resource "aws_cloudfront_origin_request_policy" "api_forward_all" {
  name    = "nat20-api-forward-all"
  comment = "Forward all headers, cookies, and query strings to API origin"

  headers_config { header_behavior = "allViewer" }
  cookies_config { cookie_behavior = "all" }
  query_strings_config { query_string_behavior = "all" }
}

# ====================
# Distribution
# ====================

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "nat20scheduling frontend + API"
  default_root_object = "index.html"

  # -------- ORIGINS --------

  # Static frontend (S3, private via OAC)
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  # Backend API (ALB)
  origin {
    domain_name = data.aws_lb.backend.dns_name
    origin_id   = "alb-backend-origin"
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_keepalive_timeout = 60
      origin_protocol_policy   = "https-only"
      origin_read_timeout      = 60
      origin_ssl_protocols     = ["TLSv1.2"]
    }

    # Secret header enforced by WAF on the ALB
    custom_header {
      name  = "X-EDGE-KEY"
      value = local.cloudfront_backend_edge_key_value
    }
  }

  # -------- DEFAULT: STATIC --------
  default_cache_behavior {
    target_origin_id       = "s3-frontend-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]
    compress        = true

    forwarded_values {
      query_string = true
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # -------- API PATHS -> ALB (no cache; forward cookies/headers/query) --------
  ordered_cache_behavior {
    path_pattern             = "/auth/*"
    target_origin_id         = "alb-backend-origin"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_forward_all.id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/availability/*"
    target_origin_id         = "alb-backend-origin"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_forward_all.id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/users/*"
    target_origin_id         = "alb-backend-origin"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_forward_all.id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/settings"
    target_origin_id         = "alb-backend-origin"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_forward_all.id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/__debug/*"
    target_origin_id         = "alb-backend-origin"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_forward_all.id
    compress                 = true
  }

  # -------- GEO/PRICE CLASS/WAF --------

  price_class = "PriceClass_100"

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  web_acl_id = data.aws_wafv2_web_acl.frontend.arn

  # -------- SSL --------

  aliases = [var.domain_name]

  viewer_certificate {
    acm_certificate_arn            = aws_acm_certificate.frontend.arn
    cloudfront_default_certificate = false
    minimum_protocol_version       = "TLSv1.2_2021"
    ssl_support_method             = "sni-only"
  }

  # SPA-friendly mapping
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

  depends_on = [aws_acm_certificate_validation.frontend]
}

# Secret for X-EDGE-KEY header used by ALB/WAF validation
data "aws_secretsmanager_secret" "cloudfront_backend_edge_key" {
  name = aws_secretsmanager_secret.cloudfront_backend_edge_key.name
}

data "aws_secretsmanager_secret_version" "cloudfront_backend_edge_key" {
  secret_id = data.aws_secretsmanager_secret.cloudfront_backend_edge_key.id
}
