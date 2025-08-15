############################################################
# ACM certificate for CloudFront (must be in us-east-1)
# DNS validation records created with static keys to avoid
# "for_each keys unknown until apply" planner errors.
############################################################

# Use the us-east-1 provider for CloudFront certs
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# Primary domain for the SPA served by CloudFront
# Expects data.aws_route53_zone.main to be defined elsewhere
resource "aws_acm_certificate" "frontend" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "cloudfront-cert-${var.domain_name}"
  }
}

# We use a static list of domains as keys so the keys are known at plan time.
# If you later add SANs, extend local.frontend_cert_domains accordingly.
locals {
  frontend_cert_domains = [var.domain_name]
}

# Create one validation record per domain in the static list.
# We look up the corresponding DVO fields from the certificate resource.
resource "aws_route53_record" "frontend_cert_validation" {
  for_each = {
    for d in local.frontend_cert_domains : d => d
  }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = one([for o in aws_acm_certificate.frontend.domain_validation_options : o.resource_record_name if o.domain_name == each.key])
  type    = one([for o in aws_acm_certificate.frontend.domain_validation_options : o.resource_record_type if o.domain_name == each.key])
  ttl     = 60
  records = [
    one([for o in aws_acm_certificate.frontend.domain_validation_options : o.resource_record_value if o.domain_name == each.key])
  ]
}

resource "aws_acm_certificate_validation" "frontend" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for r in aws_route53_record.frontend_cert_validation : r.fqdn]
}
