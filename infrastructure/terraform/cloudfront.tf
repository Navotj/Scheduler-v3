##############################
# CloudFront distribution (static multi-page + API routing)
# - S3 origin (private) with OAC
# - API origin routed at /api/* (and exact /api)
# - Default root object: index.html
# - 404 handling: serve /404.html with 404 status
##############################

# Managed policy IDs by name
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}
data "aws_cloudfront_origin_request_policy" "cors_s3_origin" {
  name = "Managed-CORS-S3Origin"
}
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}
# Forward all viewer headers EXCEPT Host (prevents host-mismatch at API)
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}
data "aws_cloudfront_response_headers_policy" "cors_with_preflight" {
  name = "Managed-CORS-With-Preflight"
}
data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.app_prefix}-oac"
  description                       = "OAC for ${var.app_prefix} S3 origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Function to strip the leading "/api" prefix before hitting API origin
resource "aws_cloudfront_function" "strip_api_prefix" {
  name    = "${var.app_prefix}-strip-api-prefix"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite /api/foo -> /foo for API origin"
  publish = true

  code = <<EOF
function handler(event) {
  var req = event.request;
  if (req.uri === '/api') {
    req.uri = '/';
  } else if (req.uri.length > 4 && req.uri.substring(0, 5) === '/api/') {
    req.uri = req.uri.substring(4);
  }
  return req;
}
EOF
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_100"
  comment             = "Frontend static multi-page site + API routing to regional endpoint"
  default_root_object = "index.html"
  http_version        = "http2and3"

  aliases = ["www.${var.root_domain}"]

  # Origins
  origin {
    origin_id                = "s3-frontend-origin"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # API origin (DNS target like api.example.com; can be NLB/ALB/CNAME)
  origin {
    origin_id   = "api-origin"
    domain_name = local.api_domain

    # Add a shared secret header so only CloudFront can call the API
    custom_header {
      name  = "X-Origin-Verify"
      value = var.origin_secret
    }

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  ########################################
  # Behaviors
  ########################################

  # Default behavior: HTML documents and anything not matched below
  default_cache_behavior {
    target_origin_id           = "s3-frontend-origin"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.cors_s3_origin.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
  }

  # Static assets: long-cache at edge
  ordered_cache_behavior {
    path_pattern               = "/styles/*"
    target_origin_id           = "s3-frontend-origin"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.cors_s3_origin.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
  }

  ordered_cache_behavior {
    path_pattern               = "/scripts/*"
    target_origin_id           = "s3-frontend-origin"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.cors_s3_origin.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
  }

  ordered_cache_behavior {
    path_pattern               = "/assets/*"
    target_origin_id           = "s3-frontend-origin"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.cors_s3_origin.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
  }

  # Explicit behavior for exact "/api" path so the function runs there too.
  ordered_cache_behavior {
    path_pattern               = "/api"
    target_origin_id           = "api-origin"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.cors_with_preflight.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.strip_api_prefix.arn
    }
  }

  # API behavior: pass-through, no caching, CORS with preflight
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api-origin"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    # Use "AllViewerExceptHostHeader" to avoid forwarding viewer Host
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.cors_with_preflight.id

    # Strip /api prefix before forwarding to API origin
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.strip_api_prefix.arn
    }
  }

  ########################################
  # Error responses
  ########################################
  # S3 REST origin returns 403 for missing keys when using OAC.
  # Serve a proper 404 page in both 403 and 404 cases.
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 0
  }
  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.origin.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [
    aws_acm_certificate_validation.origin,
    aws_cloudfront_origin_access_control.frontend
  ]

  lifecycle {
    ignore_changes = [tags]
  }

  tags = {
    App = var.app_prefix
  }
}
