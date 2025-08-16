# --- add (once) ---
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# In your existing aws_cloudfront_distribution.frontend {...}:
resource "aws_cloudfront_distribution" "frontend" {
  # ... your existing config (S3 origin, default behavior, cert, etc.)

  # --- add ALB origin ---
  origin {
    domain_name = aws_lb.nat20_backend_alb.dns_name  # adjust to your ALB resource
    origin_id   = "alb-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"           # switch to https-only if you add 443 on ALB
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # --- add behaviors for backend paths (forward cookies) ---
  ordered_cache_behavior {
    path_pattern             = "/auth/*"
    target_origin_id         = "alb-origin"
    allowed_methods          = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods           = ["GET","HEAD","OPTIONS"]
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern             = "/users/*"
    target_origin_id         = "alb-origin"
    allowed_methods          = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods           = ["GET","HEAD","OPTIONS"]
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern             = "/availability/*"
    target_origin_id         = "alb-origin"
    allowed_methods          = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods           = ["GET","HEAD","OPTIONS"]
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern             = "/settings"
    target_origin_id         = "alb-origin"
    allowed_methods          = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods           = ["GET","HEAD","OPTIONS"]
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern             = "/settings/*"
    target_origin_id         = "alb-origin"
    allowed_methods          = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods           = ["GET","HEAD","OPTIONS"]
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern             = "/login"
    target_origin_id         = "alb-origin"
    allowed_methods          = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods           = ["GET","HEAD","OPTIONS"]
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern             = "/logout"
    target_origin_id         = "alb-origin"
    allowed_methods          = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods           = ["GET","HEAD","OPTIONS"]
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  ordered_cache_behavior {
    path_pattern             = "/health"
    target_origin_id         = "alb-origin"
    allowed_methods          = ["GET","HEAD","OPTIONS"]
    cached_methods           = ["GET","HEAD","OPTIONS"]
    viewer_protocol_policy   = "redirect-to-https"
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  # ... keep your existing default_cache_behavior to S3 for static files
}
