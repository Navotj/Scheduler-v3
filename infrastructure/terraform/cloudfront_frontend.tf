############################################################
# CloudFront Distribution for Frontend (SPA) + /auth -> API
############################################################

# Response headers for API (optional)
resource "aws_cloudfront_response_headers_policy" "api_cors" {
  name = "api-cors-${replace(var.domain_name, ".", "-")}"

  cors_config {
    access_control_allow_credentials = false

    access_control_allow_headers { items = ["*"] }
    access_control_allow_methods { items = ["GET","HEAD","OPTIONS","POST","PUT","PATCH","DELETE"] }
    access_control_allow_origins { items = ["https://${var.domain_name}", "https://www.${var.domain_name}"] }
    access_control_expose_headers { items = ["*"] }

    access_control_max_age_sec = 600
    origin_override            = true
  }
}

# Origin Access Identity (OAI) for S3 origin (provider version requires OAI)
resource "aws_cloudfront_origin_access_identity" "frontend" {
  comment = "OAI for ${var.domain_name} static frontend bucket"
}

# Origin/Cache policies for /auth/*
resource "aws_cloudfront_origin_request_policy" "cookies_all_qs" {
  name = "cookies-all-qstrings-${replace(var.domain_name, ".", "-")}"
  cookies_config  { cookie_behavior = "all" }
  headers_config  { header_behavior = "none" }
  query_strings_config { query_string_behavior = "all" }
}

resource "aws_cloudfront_cache_policy" "no_cache" {
  name        = "no-cache-${replace(var.domain_name, ".", "-")}"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0
  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config  { cookie_behavior = "all" }
    headers_config  { header_behavior = "none" }
    query_strings_config { query_string_behavior = "all" }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "nat20scheduling frontend + /auth API proxy"
  default_root_object = "index.html"

  aliases = [var.domain_name, "www.${var.domain_name}"]

  # ---------- Origins ----------
  origin {
    origin_id   = "frontend-s3-origin"
    domain_name = "${var.domain_name}.s3.${data.aws_region.current.name}.amazonaws.com"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.frontend.cloudfront_access_identity_path
    }
  }

  origin {
    origin_id   = "alb-backend"
    domain_name = "${var.api_subdomain}.${var.domain_name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"   # CF -> ALB over HTTPS
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # ---------- Behaviors ----------
  default_cache_behavior {
    target_origin_id       = "frontend-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # Managed - CachingOptimized
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  ordered_cache_behavior {
    path_pattern           = "/auth/*"
    target_origin_id       = "alb-backend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.cookies_all_qs.id
    # response_headers_policy_id = aws_cloudfront_response_headers_policy.api_cors.id
  }

  # ---------- Error responses (SPA routing) ----------
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

  restrictions { geo_restriction { restriction_type = "none" } }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "nat20-frontend-cf" }
}
