########################################
# Route 53 zone reference (existing zone)
########################################
data "aws_route53_zone" "root" {
  name         = var.root_domain
  private_zone = false
}

########################################
# Viewer cert for CloudFront (us-east-1), WWW ONLY
########################################
resource "aws_acm_certificate" "origin" {
  provider          = aws.us_east_1
  domain_name       = local.frontend_hostname
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.app_prefix}-origin-cert"
    App         = var.app_prefix
    Terraform   = "true"
    ManagedBy   = "terraform"
    Environment = "prod"
  }
}

resource "aws_route53_record" "origin_validation" {
  for_each = {
    for dvo in aws_acm_certificate.origin.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.root.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "origin" {
  provider                 = aws.us_east_1
  certificate_arn         = aws_acm_certificate.origin.arn
  validation_record_fqdns = [for r in aws_route53_record.origin_validation : r.fqdn]

  depends_on = [aws_route53_record.origin_validation]
}

########################################
# API cert (regional, unchanged)
########################################
resource "aws_acm_certificate" "api" {
  domain_name       = local.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.app_prefix}-api-cert"
    App         = var.app_prefix
    Terraform   = "true"
    ManagedBy   = "terraform"
    Environment = "prod"
  }
}

resource "aws_route53_record" "api_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.root.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_validation : r.fqdn]

  depends_on = [aws_route53_record.api_validation]
}
