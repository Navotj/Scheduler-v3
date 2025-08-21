############################################################
# ACM (regional) for API and ORIGIN subdomains (ALB listeners)
# Security groups for the two ALBs (referenced by Ingress annotations)
# + In-cluster allow rules so ALBs (IP targets) can reach pods via node ENIs
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

############################################################
# Security Groups
############################################################

# Backend ALB: HTTPS from CloudFront; egress locked to pods on 3000 within VPC
resource "aws_security_group" "alb_backend" {
  name                   = "${var.project_name}-alb-backend"
  description            = "ALB (backend) security group (HTTPS from CloudFront origin fetchers)"
  vpc_id                 = data.aws_vpc.default.id
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

  # 🔒 Egress only to backend pods via nodes on 3000, inside the VPC
  egress {
    description = "To backend pods (VPC) on 3000"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }

  tags = { Name = "${var.project_name}-alb-backend" }
}

# Frontend ALB: HTTPS from CloudFront; egress locked to pods on 8080 within VPC
resource "aws_security_group" "alb_frontend" {
  name                   = "${var.project_name}-alb-frontend"
  description            = "ALB (frontend) security group (HTTPS from CloudFront origin fetchers)"
  vpc_id                 = data.aws_vpc.default.id
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

  # 🔒 Egress only to frontend pods via nodes on 8080, inside the VPC
  egress {
    description = "To frontend pods (VPC) on 8080"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }

  tags = { Name = "${var.project_name}-alb-frontend" }
}

############################################################
# Allow ALB → node ENIs (pods via IP targets)
# Frontend pods listen on 8080; Backend pods on 3000
# Uses the cluster security group attached to nodes (managed by EKS)
############################################################

resource "aws_security_group_rule" "alb_frontend_to_nodes_8080" {
  type                     = "ingress"
  description              = "Allow Frontend ALB to reach pods (IP targets) via node ENIs on 8080"
  from_port                = 8080
  to_port                  = 8080
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb_frontend.id
  security_group_id        = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

resource "aws_security_group_rule" "alb_backend_to_nodes_3000" {
  type                     = "ingress"
  description              = "Allow Backend ALB to reach pods (IP targets) via node ENIs on 3000"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb_backend.id
  security_group_id        = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}
