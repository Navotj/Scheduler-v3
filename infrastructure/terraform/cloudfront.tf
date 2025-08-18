############################################################
# CloudFront (Frontend + API routing)
# - Default origin: S3 static site (via OAC)
# - API paths -> ALB origin with cookies/headers/query forwarded
# - SPA fallback handled by CF Function on S3 ONLY (no API rewrite)
############################################################

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

# ---------- Custom Origin Request Policy for API ----------
# Forwards ALL cookies and ALL query strings, and needed headers (includes Authorization).
resource "aws_cloudfront_origin_request_policy" "api_all_cookies" {
  name = "api-all-cookies-all-qs-headers"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "Accept",
        "Accept-Language",
        "Content-Type",
        "Origin",
        "Referer",
        "User-Agent",
        "Access-Control-Request-Headers",
        "Access-Control-Request-Method",
        "Authorization"
      ]
    }
  }

  query_strings_config {
    query_string_behavior = "all"
  }
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

# ---------- LEGACY OAI (kept during OAC migration to prevent downtime) ----------
resource "aws_cloudfront_origin_access_identity" "frontend" {
  comment = "LEGACY: kept to avoid downtime while migrating to OAC"
  lifecycle { prevent_destroy = true }
}

# ---------- CloudFront Distribution ----------
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Frontend SPA + API routing"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  aliases = [ var.domain_name ]

  origin {
    domain_name                  = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                    = "s3-frontend"
    origin_access_control_id     = aws_cloudfront_origin_access_control.frontend.id
    connection_attempts          = 3
    connection_timeout           = 10
  }

  origin {
    domain_name              = "${var.api_subdomain}.${var.domain_name}" # SNI must match ALB cert
    origin_id                = "alb-origin"
    connection_attempts      = 3
    connection_timeout       = 10
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }
  }

  # Default behavior (S3)
  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_optimized.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.managed_all_viewer.id
    compress = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # Ordered behaviors (API -> ALB)
  ordered_cache_behavior {
    path_pattern           = "/auth/check"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/check"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/auth/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/availability/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/settings"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/settings/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/users/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
    compress = true
  }

  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"]
    cached_methods         = ["GET","HEAD","OPTIONS"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.managed_caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_cookies.id
    compress = true
  }

  # Restrictions
  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  # TLS
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.frontend.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "nat20-frontend-cf" }
}

# S3 bucket policy for frontend (OAC + LEGACY OAI + TLS-only)
data "aws_iam_policy_document" "frontend_bucket_policy" {
  # Allow CloudFront via OAC
  statement {
    sid     = "AllowCloudFrontReadViaOAC"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }

  # Allow legacy OAI (until fully cut over)
  statement {
    sid     = "AllowCloudFrontReadViaOAI"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "CanonicalUser"
      identifiers = [aws_cloudfront_origin_access_identity.frontend.s3_canonical_user_id]
    }
  }

  # Defense-in-depth: require TLS
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.frontend.arn,
      "${aws_s3_bucket.frontend.arn}/*"
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend_oai" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket_policy.json
}
