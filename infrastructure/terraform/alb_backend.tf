###############################################
# ALB + HTTPS for backend (api.nat20scheduling.com)
# - No manual instance IDs required
# - Uses the existing aws_instance.backend and aws_security_group.backend_access
# - Assumes backend listens on TCP 3000 (adjust in local if needed)
###############################################

locals {
  backend_port            = 3000
  api_fqdn                = "api.nat20scheduling.com"
  health_check_path       = "/health"
}

# Security group for ALB (ingress 443 from the internet)
resource "aws_security_group" "alb" {
  name        = "alb-https-nat20scheduling"
  description = "Allow HTTPS to ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
    description      = "HTTPS from anywhere"
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = { Name = "alb-https" }
}

# Allow ALB to reach backend on its port (grants ingress to the existing backend SG)
resource "aws_security_group_rule" "backend_allow_from_alb" {
  type                     = "ingress"
  security_group_id        = aws_security_group.backend_access.id
  source_security_group_id = aws_security_group.alb.id
  from_port                = local.backend_port
  to_port                  = local.backend_port
  protocol                 = "tcp"
  description              = "Allow ALB to backend port"
}

# Application Load Balancer (public)
resource "aws_lb" "api" {
  name               = "alb-nat20scheduling"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]

  # Use your existing default subnet from main.tf; add more subnets if you want multi-AZ
  subnets = [data.aws_subnet.eu_central_1b.id]

  enable_deletion_protection = false
}

# Target group for backend (instance-targets; no manual IDs—attach the Terraform-managed instance)
resource "aws_lb_target_group" "api" {
  name                 = "tg-nat20scheduling"
  port                 = local.backend_port
  protocol             = "HTTP"
  target_type          = "instance"
  vpc_id               = data.aws_vpc.default.id
  deregistration_delay = 10

  health_check {
    enabled             = true
    interval            = 15
    path                = local.health_check_path
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    matcher             = "200-399"
  }
}

# Attach the Terraform-managed backend instance (no IDs needed)
resource "aws_lb_target_group_attachment" "api_backend" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = aws_instance.backend.id
  port             = local.backend_port
}

########################################################
# ACM certificate (eu-central-1) + DNS validation (R53)
########################################################

# Use existing hosted zone
data "aws_route53_zone" "main" {
  name         = "nat20scheduling.com"
  private_zone = false
}

resource "aws_acm_certificate" "api" {
  domain_name       = local.api_fqdn
  validation_method = "DNS"

  lifecycle { create_before_destroy = true }
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

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

#########################
# HTTPS listener on ALB
#########################

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

##########################################
# DNS: api.nat20scheduling.com -> the ALB
##########################################

resource "aws_route53_record" "api_alias" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.api_fqdn
  type    = "A"
  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = false
  }
}
