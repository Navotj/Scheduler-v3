############################################################
# CloudFront (Frontend + API routing)
# - Default origin: S3 static site (via OAC)
# - API paths -> ALB origin with AllViewerExceptHostHeader
# - SPA fallback handled by CF Function on S3 ONLY (no API rewrite)
# NOTE: Uses hard-coded IDs for AWS managed policies to avoid data-source duplication
############################################################

locals {
  # Managed policy IDs (AWS)
  cf_cache_policy_caching_optimized        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  cf_cache_policy_caching_disabled         = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
  cf_origin_request_all_viewer_except_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
  cf_origin_request_cors_s3                = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # CORS-S3Origin (do NOT forward Host)
}

# ---------- ACM certificate for CloudFront (us-east-1) ----------
resource "aws_acm_certificate" "frontend" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle { create_before_destroy = true }

  tags = { Name = "frontend-cert-${var.domain_name}" }
}

# DNS validation records for the ACM cert
resource "aws_route53_record" "frontend_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.frontend.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

# Validate the certificate
resource "aws_acm_certificate_validation" "frontend" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for r in aws_route53_record.frontend_cert_validation : r.fqdn]
}

# ---------- Origin Access Control for S3 (OAC) ----------
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "frontend-oac"
  description                       = "OAC for CloudFront to access S3 frontend bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------- CloudFront Function for SPA rewrite on S3 ONLY ----------
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "spa-rewrite-index"
  runtime = "cloudfront-js-1.0"
  publish = true
  code    = <<-EOF
function handler(event) {
  var req = event.request;
  var uri = req.uri;

  // Never rewrite API or dynamic endpoints
  if (uri === '/auth' ||
      uri === '/check' ||
      uri.startsWith('/auth/') ||
      uri.startsWith('/availability') ||
      uri.startsWith('/users') ||
      uri.startsWith('/api') ||
      uri.startsWith('/settings')) {
    return req;
  }

  // SPA: If no file extension and GET, serve index.html
  if (req.method === 'GET' && uri.indexOf('.') === -1) {
    req.uri = '/index.html';
  }
  return req;
}
EOF
}

# ---------- CloudFront Distribution ----------
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Frontend SPA + API routing"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  aliases = [var.domain_name]

  # S3 origin (via OAC)
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
    connection_attempts      = 3
    connection_timeout       = 10
  }

  # ALB origin by DNS (api.<domain>)
  # ALB origin by DNS (use the ALB's DNS name; CF -> ALB over HTTP)
  origin {
    domain_name         = var.alb_dns_name  # e.g. nat20-backend-alb-123456.eu-central-1.elb.amazonaws.com
    origin_id           = "alb-origin"
    connection_attempts = 3
    connection_timeout  = 10

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only"         # CloudFront to ALB over HTTP (avoids TLS/SNI mismatch)
      origin_ssl_protocols     = ["TLSv1.2"]         # kept for completeness; unused with http-only
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }
  }

  # ---------- Default behavior (S3) ----------
  # IMPORTANT: Use CORS-S3Origin so Host is NOT forwarded to S3
  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD", "OPTIONS"]

    cache_policy_id          = local.cf_cache_policy_caching_optimized
    origin_request_policy_id = local.cf_origin_request_cors_s3

    compress = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # ---------- Ordered behaviors (API -> ALB) ----------
  # Exact paths before prefixes for deterministic matching.

  ordered_cache_behavior {
    path_pattern           = "/auth/check"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/check"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/auth/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/availability/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/settings"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/settings/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/users/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  # ---------- Restrictions ----------
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # ---------- TLS ----------
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "nat20-frontend-cf" }
}
