##############################
# CloudFront – Frontend + API
##############################

# Managed policies (no caching for /auth, forward everything)
data "aws_cloudfront_cache_policy" "managed_caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "managed_caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "managed_all_viewer" {
  name = "Managed-AllViewer"
}

# Keep the legacy custom policy present so TF won't try to delete it
# while CloudFront might still reference it. We won't attach it anywhere.
resource "aws_cloudfront_origin_request_policy" "cookies_all_qs" {
  name = "cookies-all-qstrings-${replace(var.domain_name, ".", "-")}"

  cookies_config { cookie_behavior = "all" }
  headers_config { header_behavior = "none" }
  query_strings_config { query_string_behavior = "all" }

  lifecycle { prevent_destroy = true }
}

# Keep the legacy OAC present for the same reason; we now use OAI instead.
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "frontend-oac"
  description                       = "OAC (legacy; retained during transition)"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"

  lifecycle { prevent_destroy = true }
}

# Response headers policy (CORS for API if you need it)
resource "aws_cloudfront_response_headers_policy" "api_cors" {
  name = "api-cors-${replace(var.domain_name, ".", "-")}"

  cors_config {
    access_control_allow_credentials = false

    access_control_allow_headers { items = ["*"] }
    access_control_allow_methods { items = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"] }
    access_control_allow_origins { items = ["https://${var.domain_name}", "https://www.${var.domain_name}"] }
    access_control_expose_headers { items = ["*"] }

    access_control_max_age_sec = 600
    origin_override            = true
  }
}

# Use OAI (satisfies provider requirement for s3_origin_config.origin_access_identity)
resource "aws_cloudfront_origin_access_identity" "frontend" {
  comment = "OAI for ${var.domain_name} static frontend bucket"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "nat20scheduling frontend + /auth API proxy"
  default_root_object = "index.html"
  is_ipv6_enabled     = true
  price_class         = "PriceClass_All"

  aliases = [
    var.domain_name,
    "www.${var.domain_name}",
  ]

  # ------------ Origins ------------
  # S3 (static frontend) — use the bucket's regional domain directly
  origin {
    origin_id   = "frontend-s3-origin"
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.frontend.cloudfront_access_identity_path
    }
  }

  # API origin (custom) at api.<domain> over HTTPS
  origin {
    origin_id   = "alb-backend"
    domain_name = "${var.api_subdomain}.${var.domain_name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 30
      origin_keepalive_timeout = 5
    }
  }

  # -------- Default behavior (SPA) --------
  default_cache_behavior {
    target_origin_id       = "frontend-s3-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    compress        = true
    cache_policy_id = data.aws_cloudfront_cache_policy.managed_caching_optimized.id
  }

  # -------- /auth/* behavior (API) --------
  ordered_cache_behavior {
    path_pattern           = "/auth/*"
    target_origin_id       = "alb-backend"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD", "OPTIONS"]

    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
    # If you truly need CF to add CORS headers (usually app sets them), uncomment:
    # response_headers_policy_id = aws_cloudfront_response_headers_policy.api_cors.id
  }

  # -------- SPA error routing --------
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
    acm_certificate_arn      = aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "nat20-frontend-cf" }

  # Make sure the cert is validated before CF creation/changes
  depends_on = [aws_acm_certificate_validation.frontend]
}
