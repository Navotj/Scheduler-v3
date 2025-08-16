############################################################
# CloudFront Distribution for Frontend (SPA) + /auth -> API
############################################################

# Current AWS region (used to form S3 regional endpoint)
data "aws_region" "current" {}

############################
# Response headers (optional)
############################
# If you need CORS on API responses (usually not required when same host),
# you can attach this policy to the /auth/* behavior via response_headers_policy_id.
resource "aws_cloudfront_response_headers_policy" "api_cors" {
  name = "api-cors-${replace(var.domain_name, ".", "-")}"

  cors_config {
    access_control_allow_credentials = false

    access_control_allow_headers {
      items = ["*"]
    }

    access_control_allow_methods {
      items = [
        "GET",
        "HEAD",
        "OPTIONS",
        "POST",
        "PUT",
        "PATCH",
        "DELETE"
      ]
    }

    access_control_allow_origins {
      items = [
        "https://${var.domain_name}",
        "https://www.${var.domain_name}"
      ]
    }

    access_control_expose_headers {
      items = ["*"]
    }

    access_control_max_age_sec = 600
    origin_override            = true
  }
}

########################################
# Origin Access Control for S3 (frontend)
########################################
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "oac-frontend-${replace(var.domain_name, ".", "-")}"
  description                       = "OAC for S3 origin of ${var.domain_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

#############################################
# Origin/Cache policies for the /auth/* paths
#############################################
# Forward all cookies + all query strings to the API
resource "aws_cloudfront_origin_request_policy" "cookies_all_qs" {
  name = "cookies-all-qstrings-${replace(var.domain_name, ".", "-")}"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    # Viewer headers are not required for cookie auth; keep minimal
    header_behavior = "none"
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

# Disable caching for auth endpoints
resource "aws_cloudfront_cache_policy" "no_cache" {
  name        = "no-cache-${replace(var.domain_name, ".", "-")}"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "all"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "all"
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

#####################################
# CloudFront Distribution (2 origins)
#####################################
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "nat20scheduling frontend + /auth API proxy"
  default_root_object = "index.html"

  aliases = [
    var.domain_name,
    "www.${var.domain_name}",
  ]

  # ---------- Origins ----------
  # S3 origin for static frontend
  origin {
    origin_id   = "frontend-s3-origin"
    domain_name = "${var.domain_name}.s3.${data.aws_region.current.name}.amazonaws.com"

    s3_origin_config {
      origin_access_identity = null
    }

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
      origin_protocol_policy = "https-only"   # keep HTTPS from CF -> ALB
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # ---------- Behaviors ----------
  # Default: serve SPA from S3
  default_cache_behavior {
    target_origin_id       = "frontend-s3-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    compress = true

    # Use the managed optimized cache policy for static sites
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  }

  # Route /auth/* to the API origin, no cache, forward cookies + QS
  ordered_cache_behavior {
    path_pattern           = "/auth/*"
    target_origin_id       = "alb-backend"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD", "OPTIONS"]

    compress                    = true
    cache_policy_id             = aws_cloudfront_cache_policy.no_cache.id
    origin_request_policy_id    = aws_cloudfront_origin_request_policy.cookies_all_qs.id
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
