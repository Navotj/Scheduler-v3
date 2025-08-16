############################################################
# Application Load Balancer for Backend API (HTTPS only)
############################################################

# Allow HTTPS only from CloudFront origin-facing IPs (managed prefix list)
data "aws_ec2_managed_prefix_list" "cloudfront_origin" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# Security group for ALB: 443 from CloudFront only
resource "aws_security_group" "alb" {
  name        = "nat20-alb-sg"
  description = "ALB security group (HTTPS from CloudFront only)"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "HTTPS from CloudFront"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront_origin.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "nat20-alb-sg"
  }
}

# Application Load Balancer
resource "aws_lb" "api" {
  name               = "nat20-backend-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [data.aws_subnet.eu_central_1a.id, data.aws_subnet.eu_central_1b.id]

  tags = {
    Name = "nat20-backend-alb"
  }
}

# Target group forwarding to backend instances/containers
# (ALB terminates TLS; targets speak HTTP on backend_port)
resource "aws_lb_target_group" "api" {
  name     = "nat20-backend-tg"
  port     = var.backend_port
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id

  health_check {
    path                = var.backend_health_check_path
    matcher             = "200-399"
    protocol            = "HTTP"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "nat20-backend-tg"
  }
}

# HTTPS listener with ACM cert for api.<domain> (regional cert in eu-central-1)
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.api.arn

  # Ensure the certificate is validated before creating the listener
  depends_on = [aws_acm_certificate_validation.api]

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
