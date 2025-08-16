############################################################
# CloudFront Distribution for Frontend (SPA) + /auth -> API
# - Uses OAC (Origin Access Control) for S3 origin
# - Uses managed Cache Policies:
#     * Default: CachingOptimized (AWS managed)
#     * /auth/*: CachingDisabled (AWS managed)
############################################################

# Response headers for API (optional; not attached by default)
resource "aws_cloudfront_response_headers_policy" "api_cors" {
  name = "api-cors-${replace(var.domain_name, ".", "-")}"

  cors_config {
    access_control_allow_credentials = false

    access_control_allow_headers {
      items = ["*"]
    }

    access_control_allow_methods {
      items = ["GET","HEAD","OPTIONS","POST","PUT","PATCH","DELETE"]
    }

    access_control_allow_origins {
      items = ["https://${var.domain_name}", "https://www.${var.domain_name}"]
    }

    access_control_expose_headers {
      items = ["*"]
    }

    access_control_max_age_sec = 600
    origin_override            = true
  }
}

# Origin Access Control for S3 origin (recommended modern approach)
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "frontend-oac"
  description                       = "OAC for frontend CloudFront to access S3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Origin/Cache policies for /auth/* (forward cookies + all query strings)
resource "aws_cloudfront_origin_request_policy" "cookies_all_qs" {
  name = "cookies-all-qstrings-${replace(var.domain_name, ".", "-")}"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "none"
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "nat20scheduling frontend + /auth API proxy"
  default_root_object = "index.html"
  is_ipv6_enabled     = true
  price_class         = "PriceClass_100"

  aliases = [var.domain_name, "www.${var.domain_name}"]

  # ---------- Origins ----------
  # S3 origin for static frontend (via OAC)
  origin {
    origin_id                = "frontend-s3-origin"
    domain_name              = "${var.domain_name}.s3.${data.aws_region.current.name}.amazonaws.com"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # API origin for /auth/*
  # NOTE: ALB must serve HTTPS for api.${domain_name} with a valid ACM cert
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
  # Default: serve SPA from S3 (Managed - CachingOptimized)
  default_cache_behavior {
    target_origin_id       = "frontend-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS Managed: CachingOptimized
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # Route /auth/* to the API origin, no cache, forward cookies + QS
  ordered_cache_behavior {
    path_pattern             = "/auth/*"
    target_origin_id         = "alb-backend"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods           = ["GET","HEAD","OPTIONS"]
    compress                 = true

    # AWS Managed: CachingDisabled
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = aws_cloudfront_origin_request_policy.cookies_all_qs.id
    # If you need CORS headers from CloudFront (usually not needed), uncomment:
    # response_headers_policy_id  = aws_cloudfront_response_headers_policy.api_cors.id
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

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    # CloudFront certificate must be in us-east-1 (defined in acm_cloudfront.tf)
    acm_certificate_arn      = aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name = "nat20-frontend-cf"
  }
}
