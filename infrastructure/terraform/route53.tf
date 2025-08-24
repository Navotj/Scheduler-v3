##############################
# Route 53 records for the CloudFront distribution
# - Creates A/AAAA ALIAS for origin.<root_domain> -> CloudFront
# Uses data.aws_route53_zone.root declared in certs.tf
##############################

resource "aws_route53_record" "origin_alias_a" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.origin_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "origin_alias_aaaa" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.origin_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
