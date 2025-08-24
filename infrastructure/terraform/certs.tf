##############################
# ACM certificates (DNS-validated via Route 53)
# - origin certificate in us-east-1 (for CloudFront / global)
# - api certificate in the default region (for regional ALB)
# Uses locals.origin_domain / locals.api_domain built from root_domain.
##############################

# Resolve hosted zone for DNS validation without hardcoding the zone ID
data "aws_route53_zone" "root" {
  name         = var.root_domain
  private_zone = false
}

##############################
# ORIGIN cert (us-east-1)
##############################
resource "aws_acm_certificate" "origin" {
  provider          = aws.us_east_1
  domain_name       = local.origin_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.app_prefix}-origin-cert"
    Environment = "prod"
    ManagedBy   = "terraform"
  }
}

# DNS validation records for origin (us-east-1)
resource "aws_route53_record" "origin_validation" {
  for_each = {
    for dvo in aws_acm_certificate.origin.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  name    = each.value.name
  type    = each.value.type
  zone_id = data.aws_route53_zone.root.zone_id
  ttl     = 60

  records = [each.value.record]
}

# Validate origin cert (us-east-1)
resource "aws_acm_certificate_validation" "origin" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.origin.arn
  validation_record_fqdns = [for r in aws_route53_record.origin_validation : r.fqdn]

  depends_on = [
    aws_route53_record.origin_validation
  ]
}

##############################
# API cert (default region)
##############################
resource "aws_acm_certificate" "api" {
  domain_name       = local.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "${var.app_prefix}-api-cert"
    Environment = "prod"
    ManagedBy   = "terraform"
  }
}

# DNS validation records for api (regional)
resource "aws_route53_record" "api_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  name    = each.value.name
  type    = each.value.type
  zone_id = data.aws_route53_zone.root.zone_id
  ttl     = 60

  records = [each.value.record]
}

# Validate api cert (regional)
resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_validation : r.fqdn]

  depends_on = [
    aws_route53_record.api_validation
  ]
}
