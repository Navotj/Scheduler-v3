############################################################
# CloudFront Distribution for Frontend (SPA) + /auth -> API
# - Uses OAI for S3 origin access (provider requires s3_origin_config + OAI)
# - /auth/* routes to api.<domain> (ALB) with:
#     * Managed-CachingDisabled (no cache)
#     * Managed-AllViewer (forwards ALL viewer headers incl. Authorization)
# - Default SPA behavior uses Managed-CachingOptimized
# - 403/404 are rewritten to /index.html for client-side routing
############################################################

########################################
# OPTIONAL: Response headers policy (CORS)
# Only needed if you want CloudFront to inject CORS headers.
# Not attached by default; uncomment in ordered_cache_behavior to use.
########################################
resource "aws_cloudfront_response_headers_policy" "api_cors" {
  name = "api-cors-${replace(var.domain_name, ".", "-")}"

  cors_config {
    access_control_allow_credentials = false

    access_control_allow_headers {
      items = ["*"]
    }

    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]
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
# Origin Access Identity for S3 (frontend)
########################################
resource "aws_cloudfront_origin_access_identity" "frontend" {
  comment = "OAI for ${var.domain_name} static frontend bucket"
}

############################################################
# Use AWS-Managed Policies (no custom creation/deletion)
# - Managed-CachingOptimized (default behavior)
# - Managed-CachingDisabled (no-cache for /auth/*)
# - Managed-AllViewer (forward ALL headers incl. Authorization)
############################################################
data "aws_cloudfront_cache_policy" "managed_caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "managed_caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "managed_all_viewer" {
  name = "Managed-AllViewer"
}

#####################################
# CloudFront Distribution (2 origins)
#####################################
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "nat20scheduling frontend + /auth API proxy"
  default_root_object = "index.html"
  is_ipv6_enabled     = true
  price_class         = "PriceClass_All"

  # Serve both apex and www via CloudFront
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
      origin_access_identity = aws_cloudfront_origin_access_identity.frontend.cloudfront_access_identity_path
    }
  }

  # API origin for /auth/*
  # NOTE: ALB must serve HTTPS for api.<domain> with a valid ACM cert
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

    compress        = true
    cache_policy_id = data.aws_cloudfront_cache_policy.managed_caching_optimized.id
  }

  # Route /auth/* to the API origin, no cache, forward ALL viewer headers (incl. Authorization)
  ordered_cache_behavior {
    path_pattern           = "/auth/*"
    target_origin_id       = "alb-backend"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD", "OPTIONS"]

    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
    # If you need CORS headers from CloudFront (usually not needed), uncomment:
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
