# Request/validate cert in us-east-1 for CloudFront
resource "aws_acm_certificate" "frontend" {
  provider          = aws.us_east_1
  domain_name       = "nat20scheduling.com"
  validation_method = "DNS"

  subject_alternative_names = [
    "www.nat20scheduling.com"
  ]

  lifecycle {
    create_before_destroy = true
  }
}

data "aws_route53_zone" "main" {
  name         = "nat20scheduling.com"
  private_zone = false
}

# DNS validation records
resource "aws_route53_record" "frontend_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.frontend.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "frontend" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for r in aws_route53_record.frontend_cert_validation : r.fqdn]
}
