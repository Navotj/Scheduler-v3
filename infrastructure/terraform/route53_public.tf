############################################################
# Public Hosted Zone (Terraform-managed) + Records
# - apex + www  -> CloudFront distribution (frontend)
# - api         -> ALB (backend origin)
# - Registrar NS sync (if same account)
############################################################

resource "aws_route53_zone" "main" {
  name = var.domain_name
}

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

# Registrar: set NS on registered domain to zone NS (if same account)
resource "aws_route53domains_registered_domain" "this" {
  provider    = aws.us_east_1
  domain_name = var.domain_name

  dynamic "name_server" {
    for_each = toset(aws_route53_zone.main.name_servers)
    content {
      name = name_server.value
    }
  }
}
