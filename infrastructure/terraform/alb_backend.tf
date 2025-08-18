############################################################
# Application Load Balancer for Backend API (HTTPS only)
# - SG allows 443 only from CloudFront origin-facing prefix list
# - Target group health-checks your backend on var.backend_port
# - NEW: attach the backend EC2 instance to the target group
############################################################

# CloudFront origin-facing managed prefix list (global)
data "aws_ec2_managed_prefix_list" "cloudfront_origin" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# Security group for ALB (HTTPS from CloudFront only)
# Security group for ALB (HTTPS from CloudFront only)
resource "aws_security_group" "alb" {
  name_prefix            = "nat20-alb-sg-"
  description            = "ALB security group (HTTPS from CloudFront origin fetchers only)"
  vpc_id                 = data.aws_vpc.default.id
  revoke_rules_on_delete = true

  lifecycle {
    create_before_destroy = true
  }

  ingress {
    description     = "HTTPS from CloudFront origin fetchers"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront_origin.id]
  }

  egress {
    description     = "Backend application traffic"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.backend_access.id]
  }

  egress {
    description = "HTTPS for health checks and AWS API calls"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS resolution"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "DNS resolution (TCP)"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "nat20-backend-alb-sg"
  }
}


# Application Load Balancer
resource "aws_lb" "api" {
  name               = "nat20-backend-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [
    data.aws_subnet.eu_central_1a.id,
    data.aws_subnet.eu_central_1b.id
  ]

  tags = {
    Name = "nat20-backend-alb"
  }
}

# Target group forwarding to backend instance
# (ALB terminates TLS; targets speak HTTP on backend_port)
resource "aws_lb_target_group" "api" {
  name     = "nat20-backend-tg"
  port     = var.backend_port
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id

  health_check {
    path                = "/health"
    matcher             = "200"
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

# >>> ATTACH THE BACKEND EC2 INSTANCE TO THE TARGET GROUP <<<
resource "aws_lb_target_group_attachment" "backend_instance" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = aws_instance.backend.id
  port             = var.backend_port

  depends_on = [aws_instance.backend]
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
