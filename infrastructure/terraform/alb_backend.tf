###############################################
# ALB + HTTPS for backend (secured behind CloudFront)
###############################################

# CloudFront origin-facing IPs (managed prefix list)
data "aws_ec2_managed_prefix_list" "cloudfront_origin" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# Security group for ALB: HTTPS only, from CloudFront POPs
resource "aws_security_group" "alb" {
  name        = "alb-https-${replace(var.domain_name, ".", "-")}"
  description = "Allow HTTPS to ALB only from CloudFront"
  vpc_id      = data.aws_vpc.default.id

  # No wide-open rules; allowlist CloudFront only
  ingress {
    description     = "CloudFront -> ALB HTTPS"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront_origin.id]
  }

  egress {
    description = "All egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "alb-https" }
}

# Application Load Balancer (internet-facing; reachable only from CloudFront by SG)
resource "aws_lb" "api" {
  name               = "nat20-backend-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [data.aws_subnet.eu_central_1a.id, data.aws_subnet.eu_central_1b.id]
}

# Target group forwarding to backend EC2 on var.backend_port
resource "aws_lb_target_group" "api" {
  name     = "nat20-backend-tg"
  port     = var.backend_port
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id

  health_check {
    path                = var.backend_health_check_path
    matcher             = "200-399"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    interval            = 15
    timeout             = 5
  }
}

# Attach backend instance to the target group
resource "aws_lb_target_group_attachment" "api_backend" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = aws_instance.backend.id
  port             = var.backend_port
}

# ACM cert for API origin domain (api.<domain>) — used ONLY between CloudFront and ALB
resource "aws_acm_certificate" "api" {
  domain_name       = "${var.api_subdomain}.${var.domain_name}"
  validation_method = "DNS"

  lifecycle { create_before_destroy = true }
}

# DNS validation records for ACM
resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options :
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

# Validate certificate
resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

# HTTPS listener forwarding to backend TG
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-Res-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# Optional public DNS for origin (api.<domain>) -> ALB (required if CloudFront origin uses this host).
# Keep disabled to avoid publishing a public record; when you wire CloudFront, set to true.
resource "aws_route53_record" "api_alias" {
  count   = var.create_api_alias ? 1 : 0
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${var.api_subdomain}.${data.aws_route53_zone.main.name}"
  type    = "A"
  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = false
  }
  allow_overwrite = true
}
