############################################################
# Application Load Balancer for Backend API (HTTPS only)
# NOTE: Security groups are defined in security_groups.tf.
# This file references aws_security_group.alb from there.
############################################################

# Uses existing data sources declared elsewhere:
# - data.aws_vpc.default
# - data.aws_subnet.eu_central_1a   (still exists, but not used here)
# - data.aws_subnet.eu_central_1b
# - aws_acm_certificate.api
# - aws_acm_certificate_validation.api
# - aws_security_group.backend_access
# - aws_security_group.alb
# - aws_instance.backend
# - var.backend_port

resource "aws_lb" "api" {
  name               = "nat20-backend-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]

  # IMPORTANT: keep the ALB only in the AZ where the single backend lives.
  # This removes cross-AZ path quirks until you add a second backend.
  subnets            = [data.aws_subnet.eu_central_1b.id]

  # Match backend keep-alives (your Node server keepAliveTimeout = 65s)
  idle_timeout       = 120

  tags = { Name = "nat20-backend-alb" }
}

resource "aws_lb_target_group" "api" {
  name        = "nat20-backend-tg"
  port        = var.backend_port
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = data.aws_vpc.default.id

  # PERSISTENT health check on /health
  health_check {
    enabled             = true
    path                = "/health"    # <- do not change
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = { Name = "nat20-backend-tg" }
}

resource "aws_lb_target_group_attachment" "backend_instance" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = aws_instance.backend.id
  port             = var.backend_port

  depends_on = [aws_instance.backend]
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.api.arn

  depends_on = [aws_acm_certificate_validation.api]

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
