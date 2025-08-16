############################################################
# CloudFront Distribution for Frontend (SPA) + /auth -> API
# - Uses OAC for S3 origin access (no public bucket)
# - Keeps /auth/* uncached and forwards all viewer headers
#   except Host (managed policy), so Authorization works
############################################################

# NOTE: data.aws_region.current is defined in data_sources.tf

# Managed policies (no custom policies needed)
data "aws_cloudfront_cache_policy" "managed_caching_optimized" {
  id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
}

data "aws_cloudfront_cache_policy" "managed_caching_disabled" {
  id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
}

data "aws_cloudfront_origin_request_policy" "managed_all_viewer" {
  id = "216adef6-5c7f-47e4-b989-5492eafa07d3" # AllViewerExceptHostHeader
}

########################################
# OAC (Origin Access Control) for S3
########################################
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "frontend-oac"
  description                       = "OAC for frontend CloudFront to access S3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
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
  # S3 origin for static frontend (OAC)
  origin {
    origin_id                   = "frontend-s3-origin"
    domain_name                 = "${var.domain_name}.s3.${data.aws_region.current.name}.amazonaws.com"
    origin_access_control_id    = aws_cloudfront_origin_access_control.frontend.id
  }

  # API origin for /auth/*
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

  # ---------- Behaviors ----------
  # Default: serve SPA from S3 (cached)
  default_cache_behavior {
    target_origin_id       = "frontend-s3-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    compress         = true
    cache_policy_id  = data.aws_cloudfront_cache_policy.managed_caching_optimized.id
  }

  # /auth/* -> API (no cache; forward all viewer headers except Host)
  ordered_cache_behavior {
    path_pattern           = "/auth/*"
    target_origin_id       = "alb-backend"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD"]

    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
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
    # CloudFront cert must be in us-east-1; resource is already created there
    acm_certificate_arn      = aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # Use all edge locations
  price_class = "PriceClass_All"

  tags = {
    Name = "nat20-frontend-cf"
  }
}
