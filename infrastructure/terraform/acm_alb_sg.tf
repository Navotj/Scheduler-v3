############################################################
# ACM (regional) for API and ORIGIN subdomains (ALB listeners)
# Security groups for the two ALBs (referenced by Ingress annotations)
############################################################

# Regional ACM cert for api.<domain>
resource "aws_acm_certificate" "api" {
  domain_name       = "${var.api_subdomain}.${var.domain_name}"
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
  tags = { Name = "api-cert-${var.domain_name}" }
}

resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }
  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

# Regional ACM cert for origin.<domain>
resource "aws_acm_certificate" "origin" {
  domain_name       = "${var.origin_subdomain}.${var.domain_name}"
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
  tags = { Name = "origin-cert-${var.domain_name}" }
}

resource "aws_route53_record" "origin_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.origin.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }
  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "origin" {
  certificate_arn         = aws_acm_certificate.origin.arn
  validation_record_fqdns = [for r in aws_route53_record.origin_cert_validation : r.fqdn]
}

# CloudFront ACM (us-east-1) for apex
resource "aws_acm_certificate" "frontend" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
  tags = { Name = "frontend-cert-${var.domain_name}" }
}

resource "aws_route53_record" "frontend_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.frontend.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }
  zone_id = aws_route53_zone.main.zone_id
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

# Security Group for Backend ALB (HTTPS from CloudFront)
resource "aws_security_group" "alb_backend" {
  name        = "${var.project_name}-alb-backend"
  description = "ALB (backend) security group (HTTPS from CloudFront origin fetchers)"
  vpc_id      = data.aws_vpc.default.id
  revoke_rules_on_delete = true

  ingress {
    description     = "HTTPS from CloudFront origin fetchers (IPv4)"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront_origin.id]
  }

  ingress {
    description      = "HTTPS IPv6 (no managed IPv6 prefix list)"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    description = "All egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-alb-backend" }
}

# Security Group for Frontend ALB (HTTPS from CloudFront)
resource "aws_security_group" "alb_frontend" {
  name        = "${var.project_name}-alb-frontend"
  description = "ALB (frontend) security group (HTTPS from CloudFront origin fetchers)"
  vpc_id      = data.aws_vpc.default.id
  revoke_rules_on_delete = true

  ingress {
    description     = "HTTPS from CloudFront origin fetchers (IPv4)"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront_origin.id]
  }

  ingress {
    description      = "HTTPS IPv6 (no managed IPv6 prefix list)"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    description = "All egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-alb-frontend" }
}
