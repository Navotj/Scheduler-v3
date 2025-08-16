############################################################
# ACM Certificate for CloudFront (us-east-1)
############################################################

resource "aws_acm_certificate" "frontend" {
  provider          = aws.us_east_1
  domain_name       = var.frontend_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "frontend_cert_validation" {
  zone_id = aws_route53_zone.main.zone_id
  name    = tolist(aws_acm_certificate.frontend.domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.frontend.domain_validation_options)[0].resource_record_type
  records = [tolist(aws_acm_certificate.frontend.domain_validation_options)[0].resource_record_value]
  ttl     = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "frontend" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [aws_route53_record.frontend_cert_validation.fqdn]
}
