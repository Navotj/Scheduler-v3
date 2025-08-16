############################################################
# CloudFront Distribution for Frontend
############################################################

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "frontend-oac"
  description                       = "OAC for frontend CloudFront to access S3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  aliases = [
    var.frontend_domain,
    "www.${var.frontend_domain}",
  ]

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend-s3-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "frontend-s3-origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    compress = true
  }

  price_class = "PriceClass_100"

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

  tags = {
    Name = "nat20-frontend-cf"
  }
}

############################################################
# Route53 Records for CloudFront Distribution
############################################################

# Apex A/ALIAS -> CloudFront
resource "aws_route53_record" "frontend" {
  zone_id         = aws_route53_zone.main.zone_id
  name            = var.frontend_domain
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

# www A/ALIAS -> CloudFront
resource "aws_route53_record" "www_a" {
  zone_id         = aws_route53_zone.main.zone_id
  name            = "www.${var.frontend_domain}"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
