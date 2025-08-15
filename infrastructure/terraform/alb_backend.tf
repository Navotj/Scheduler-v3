###############################################
# ALB + HTTPS for backend (api.<domain>)
###############################################

# Security group for ALB (ingress 443 from the internet)
resource "aws_security_group" "alb" {
  name        = "alb-https-${replace(var.domain_name, ".", "-")}"
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

# Allow ALB -> Backend SG on backend_port (exact rule in security_groups.tf adds this)
# (kept separate to avoid circular refs)

# Application Load Balancer
resource "aws_lb" "api" {
  name               = "alb-${replace(var.domain_name, ".", "-")}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [data.aws_subnet.eu_central_1b.id]

  enable_deletion_protection = false
}

# Target group for backend
resource "aws_lb_target_group" "api" {
  name                 = "tg-${replace(var.domain_name, ".", "-")}"
  port                 = var.backend_port
  protocol             = "HTTP"
  target_type          = "instance"
  vpc_id               = data.aws_vpc.default.id
  deregistration_delay = 10

  health_check {
    enabled             = true
    interval            = 15
    path                = var.backend_health_check_path
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    matcher             = "200-399"
  }
}

# Register Terraform-managed instance
resource "aws_lb_target_group_attachment" "api_backend" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = aws_instance.backend.id
  port             = var.backend_port
}

# ACM cert in main region for api.<domain>
resource "aws_acm_certificate" "api" {
  domain_name       = "${var.api_subdomain}.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
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

# HTTPS listener
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

# api.<domain> -> ALB
resource "aws_route53_record" "api_alias" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${var.api_subdomain}.${data.aws_route53_zone.main.name}"
  type    = "A"
  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = false
  }
}
