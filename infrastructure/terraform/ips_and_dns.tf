###############################################
# Public DNS records
###############################################

# Apex -> CloudFront (A / AAAA)
resource "aws_route53_record" "apex_a" {
  zone_id         = aws_route53_zone.main.zone_id
  name            = chomp(aws_route53_zone.main.name)
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "apex_aaaa" {
  zone_id         = aws_route53_zone.main.zone_id
  name            = chomp(aws_route53_zone.main.name)
  type            = "AAAA"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

# www -> CloudFront (A / AAAA)
resource "aws_route53_record" "www_a" {
  zone_id         = aws_route53_zone.main.zone_id
  name            = "www.${chomp(aws_route53_zone.main.name)}"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_aaaa" {
  zone_id         = aws_route53_zone.main.zone_id
  name            = "www.${chomp(aws_route53_zone.main.name)}"
  type            = "AAAA"
  allow_overwrite = true

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
