#############################################
# ACM certificate for CloudFront (us-east-1)
# DNS-validated via Route 53
#############################################

# Use a dedicated us-east-1 provider for CloudFront certificates
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# Public hosted zone for the apex domain
data "aws_route53_zone" "root" {
  name         = var.root_domain
  private_zone = false
}

# ACM certificate in us-east-1 covering the apex and www
resource "aws_acm_certificate" "origin" {
  provider = aws.us_east_1

  domain_name               = var.root_domain
  subject_alternative_names = ["www.${var.root_domain}"]
  validation_method         = "DNS"

  tags = {
    Name        = "${var.app_prefix}-origin-cert"
    App         = var.app_prefix
    Terraform   = "true"
    ManagedBy   = "terraform"
    Environment = "prod"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation records for each domain/SAN
resource "aws_route53_record" "origin_validation" {
  for_each = {
    for dvo in aws_acm_certificate.origin.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }

  zone_id = data.aws_route53_zone.root.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.value]

  allow_overwrite = true
}

# Finalize validation (certificate must be ISSUED for CloudFront)
resource "aws_acm_certificate_validation" "origin" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.origin.arn
  validation_record_fqdns = [for r in aws_route53_record.origin_validation : r.fqdn]
}
