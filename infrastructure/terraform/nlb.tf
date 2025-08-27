##############################
# Private NLB for backend:3000
##############################

resource "aws_lb" "backend_nlb" {
  name               = "${var.app_prefix}-backend-nlb"
  load_balancer_type = "network"
  internal           = true
  subnets            = [aws_subnet.private_a.id]

  enable_deletion_protection = false
  tags = { Name = "${var.app_prefix}-backend-nlb" }
}

resource "aws_lb_target_group" "backend_http_3000" {
  name        = "${var.app_prefix}-backend-tg-3000"
  port        = 3000
  protocol    = "TCP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    protocol            = "HTTP"
    port                = "3000"
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  tags = { Name = "${var.app_prefix}-backend-tg-3000" }
}

resource "aws_lb_target_group_attachment" "backend_attach" {
  target_group_arn = aws_lb_target_group.backend_http_3000.arn
  target_id        = aws_instance.backend.id
  port             = 3000
}

resource "aws_lb_listener" "backend_nlb_3000" {
  load_balancer_arn = aws_lb.backend_nlb.arn
  port              = 3000
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend_http_3000.arn
  }
}
