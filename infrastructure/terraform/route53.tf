########################################
# Route 53 records (WWW only) -> CloudFront
# Uses data.aws_route53_zone.root from certs.tf
########################################

resource "aws_route53_record" "www_a" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.frontend_hostname
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_aaaa" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = local.frontend_hostname
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
