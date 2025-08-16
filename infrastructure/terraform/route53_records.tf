############################################################
# Route 53 records
# - apex + www  -> CloudFront distribution (frontend)
# - api         -> ALB (backend origin host)
############################################################

# Apex -> CloudFront
resource "aws_route53_record" "apex_a" {
  zone_id = aws_route53_zone.main.zone_id
  name    = aws_route53_zone.main.name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = "Z2FDTNDATAQYW2" # CloudFront hosted zone ID (global)
    evaluate_target_health = false
  }

  allow_overwrite = true
}

# www -> CloudFront
resource "aws_route53_record" "www_a" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }

  allow_overwrite = true
}

# api -> ALB (backend origin)
resource "aws_route53_record" "api_a" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }

  allow_overwrite = true
}
