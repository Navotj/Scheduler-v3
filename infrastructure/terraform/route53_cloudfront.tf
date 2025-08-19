############################################################
# CloudFront (Apex) + Route53 records
############################################################

locals {
  cf_cache_policy_caching_optimized        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  cf_cache_policy_caching_disabled         = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
  cf_origin_request_all_viewer_except_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
  cf_origin_request_cors_s3                = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # CORS-S3Origin
}

# CloudFront Function for SPA rewrite on frontend origin only
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

  if (req.method === 'GET' && uri.indexOf('.') === -1) {
    req.uri = '/index.html';
  }
  return req;
}
EOF
}

# CloudFront Distribution: default origin -> FRONTEND ALB, API paths -> BACKEND ALB
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Frontend SPA + API routing to ALBs"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  aliases = [var.domain_name]

  # Frontend ALB origin
  origin {
    domain_name         = aws_route53_record.origin_a.fqdn
    origin_id           = "frontend-alb"
    connection_attempts = 3
    connection_timeout  = 10

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }
  }

  # Backend ALB origin (api.<domain>)
  origin {
    domain_name         = aws_route53_record.api_a.fqdn
    origin_id           = "backend-alb"
    connection_attempts = 3
    connection_timeout  = 10

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }
  }

  # Default behavior -> FRONTEND
  default_cache_behavior {
    target_origin_id       = "frontend-alb"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD", "OPTIONS"]

    cache_policy_id          = local.cf_cache_policy_caching_optimized
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host

    compress = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # Ordered behaviors -> BACKEND for API paths
  ordered_cache_behavior {
    path_pattern           = "/auth/check"
    target_origin_id       = "backend-alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/check"
    target_origin_id       = "backend-alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/auth/*"
    target_origin_id       = "backend-alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/availability/*"
    target_origin_id       = "backend-alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/settings*"
    target_origin_id       = "backend-alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/users/*"
    target_origin_id       = "backend-alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "backend-alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = local.cf_cache_policy_caching_disabled
    origin_request_policy_id = local.cf_origin_request_all_viewer_except_host
    compress = true
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${var.project_name}-frontend-cf" }

  depends_on = [
    aws_acm_certificate_validation.frontend
  ]
}

# Route53 A records
# Apex -> CloudFront
resource "aws_route53_record" "apex_a" {
  zone_id = aws_route53_zone.main.zone_id
  name    = aws_route53_zone.main.name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }

  allow_overwrite = true
}

# api -> backend ALB (created by controller; we point at its DNS via alias record)
# We'll set this after ALB exists using a placeholder; instead create it as an alias to a dummy,
# then the controller will adopt via 'external-dns' in future. For now we set to the ALB DNS from output.
# To simplify, create a CNAME to the ALB later in CI. Here create the record resource with a variable value.
variable "backend_alb_dns" {
  description = "Backend ALB DNS name (filled by CI after Ingress creation). Leave default empty on first apply."
  type        = string
  default     = ""
}

variable "frontend_alb_dns" {
  description = "Frontend ALB DNS name (filled by CI after Ingress creation). Leave default empty on first apply."
  type        = string
  default     = ""
}

resource "aws_route53_record" "api_a" {
  count   = var.backend_alb_dns == "" ? 0 : 1
  zone_id = aws_route53_zone.main.zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.backend_alb_dns
    zone_id                = data.aws_elb_hosted_zone_id.main.id
    evaluate_target_health = true
  }

  allow_overwrite = true
}

resource "aws_route53_record" "origin_a" {
  count   = var.frontend_alb_dns == "" ? 0 : 1
  zone_id = aws_route53_zone.main.zone_id
  name    = "${var.origin_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.frontend_alb_dns
    zone_id                = data.aws_elb_hosted_zone_id.main.id
    evaluate_target_health = true
  }

  allow_overwrite = true
}

# Helper: get ELB hosted zone id for aliases
data "aws_elb_hosted_zone_id" "main" {}
