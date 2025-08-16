############################################################
# Route 53 record for API: api.<domain> -> ALB
# Requires:
# - aws_route53_zone.main   (defined in route53_zone.tf)
# - aws_lb.api              (defined in alb_backend.tf)
# - variables: domain_name, api_subdomain
############################################################

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
