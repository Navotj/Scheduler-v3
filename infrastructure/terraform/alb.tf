############################################################
# Application Load Balancer for Backend API
# NOTE: Security groups are defined in security_groupts.tf.
############################################################

# Uses existing data sources declared elsewhere:
# - data.aws_vpc.default
# - data.aws_subnet.eu_central_1a
# - data.aws_subnet.eu_central_1b
# - aws_acm_certificate.api
# - aws_acm_certificate_validation.api
# - aws_security_group.backend_access
# - aws_security_group.alb
# - aws_instance.backend

resource "aws_lb" "api" {
  name               = "nat20-backend-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [
    data.aws_subnet.eu_central_1a.id,
    data.aws_subnet.eu_central_1b.id
  ]
  idle_timeout       = 120

  tags = {
    Name = "nat20-backend-alb"
  }
}

resource "aws_lb_target_group" "api" {
  name     = "nat20-backend-tg"
  port     = var.backend_port
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id

  # PERSISTENT health check on /health
  health_check {
    path                = var.backend_health_check_path
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "nat20-backend-tg"
  }
}

# HTTPS listener (kept but default 403; we use HTTP from CloudFront)
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.api.arn

  depends_on = [aws_acm_certificate_validation.api]

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}

# HTTP listener (CloudFront origin uses this)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}

# Allow only requests with the shared secret header to reach targets (HTTP)
resource "aws_lb_listener_rule" "http_from_cf_with_secret" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin_secret.result]
    }
  }
}

# Mirror rule on HTTPS (future-proof if you flip CF→HTTPS)
resource "aws_lb_listener_rule" "https_from_cf_with_secret" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin_secret.result]
    }
  }
}

# Attach all backend instances to TG
resource "aws_lb_target_group_attachment" "backend_instance" {
  for_each         = aws_instance.backend
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = each.value.id
  port             = var.backend_port
}
