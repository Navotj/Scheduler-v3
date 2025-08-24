##############################
# ACM certificates (DNS-validated via Route 53)
# - origin certificate in us-east-1 (for CloudFront / global)
# - api certificate in the default region (for regional ALB)
# Uses var.root_domain and locals (origin/api) defined in variables.tf
##############################

# Resolve hosted zone for DNS validation without hardcoding the zone ID
data "aws_route53_zone" "root" {
  name         = var.root_domain
  private_zone = false
}

##############################
# ORIGIN cert (us-east-1) — covers apex + www + origin
##############################
resource "aws_acm_certificate" "origin" {
  provider                  = aws.us_east_1
  domain_name               = var.root_domain
  subject_alternative_names = ["www.${var.root_domain}", local.origin_domain]
  validation_method         = "DNS"

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

# DNS validation records for all names on the us-east-1 cert
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

# Complete validation (us-east-1)
resource "aws_acm_certificate_validation" "origin" {
  provider                 = aws.us_east_1
  certificate_arn         = aws_acm_certificate.origin.arn
  validation_record_fqdns = [for r in aws_route53_record.origin_validation : r.fqdn]

  depends_on = [aws_route53_record.origin_validation]
}

##############################
# API cert (regional)
##############################
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
