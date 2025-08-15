###############################################
# CloudFront Distribution (Frontend + Private API via ALB)
###############################################

# OAC for S3 static frontend
resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "oac-${replace(var.domain_name, ".", "-")}"
  description                       = "OAC for ${var.domain_name} front-end bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Cache/Origin Request policies for API (no cache, forward cookies/headers/query)
resource "aws_cloudfront_cache_policy" "api_no_cache" {
  name        = "nat20-api-no-cache"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    headers_config {
      header_behavior = "none"
    }

    cookies_config {
      cookie_behavior = "all"
    }

    query_strings_config {
      query_string_behavior = "all"
    }
  }
}

resource "aws_cloudfront_origin_request_policy" "api_forward_all" {
  name = "nat20-api-forward-all"

  headers_config {
    header_behavior = "allViewer"
  }

  cookies_config {
    cookie_behavior = "all"
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "nat20scheduling frontend + API"
  default_root_object = "index.html"

  ##########################################################
  # ORIGINS
  ##########################################################

  # Static frontend (S3)
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  # Backend API (ALB) — CloudFront -> ALB over HTTPS only
  origin {
    domain_name = aws_lb.backend.dns_name
    origin_id   = "alb-backend-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # Shared secret header (must match ALB/WAF rule)
    origin_custom_header {
      name  = "X-EDGE-KEY"
      value = var.cloudfront_backend_edge_key
    }
  }

  ##########################################################
  # BEHAVIORS
  ##########################################################

  # Default: serve static app from S3
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

  # API paths -> backend ALB (no cache, forward cookies/headers/query)
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

  # Optional: debug passthrough to backend
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

  price_class = "PriceClass_100"

  aliases = [
    var.domain_name,
    "www.${var.domain_name}",
  ]

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.frontend.certificate_arn
    minimum_protocol_version = "TLSv1.2_2021"
    ssl_support_method       = "sni-only"
  }

  # SPA-friendly: map 403/404 to index.html
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

  logging_config {
    include_cookies = false
    bucket          = aws_s3_bucket.logs.bucket_domain_name
    prefix          = "cloudfront/"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  web_acl_id = aws_wafv2_web_acl.cf_frontend.arn

  depends_on = [aws_acm_certificate_validation.frontend]
}
