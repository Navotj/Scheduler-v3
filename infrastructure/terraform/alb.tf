############################################################
# Application Load Balancer for Backend API (HTTPS only)
# - Security Group: allow 443 from CloudFront origin-facing prefix list
# - Target Group: HTTP on var.backend_port with health_check path = "/health"
# - Listener: HTTPS (TLS 1.2/1.3 policy) using regional ACM cert for api.<domain>
# - Attachment: backend instance -> target group
############################################################

# Uses existing data sources declared elsewhere:
# - data.aws_vpc.default
# - data.aws_subnet.eu_central_1a
# - data.aws_subnet.eu_central_1b
# - data.aws_ec2_managed_prefix_list.cloudfront_origin
# - aws_acm_certificate.api
# - aws_acm_certificate_validation.api
# - aws_security_group.backend_access
# - aws_instance.backend

resource "aws_security_group" "alb" {
  name_prefix            = "nat20-alb-sg-"
  description            = "ALB security group (HTTPS from CloudFront origin fetchers)"
  vpc_id                 = data.aws_vpc.default.id
  revoke_rules_on_delete = true

  lifecycle {
    create_before_destroy = true
  }

  # Ingress: HTTPS from CloudFront origin-facing (IPv4)
  ingress {
    description     = "HTTPS from CloudFront origin fetchers (IPv4)"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront_origin.id]
  }

  # Ingress: HTTPS IPv6 (no managed prefix list available for CloudFront origin dualstack)
  ingress {
    description      = "HTTPS IPv6 for CloudFront dualstack origin connections"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    ipv6_cidr_blocks = ["::/0"]
  }

  # Egress to backend instance SG on app port
  egress {
    description     = "Backend application traffic"
    from_port       = var.backend_port
    to_port         = var.backend_port
    protocol        = "tcp"
    security_groups = [aws_security_group.backend_access.id]
  }

  # Egress for health checks / AWS APIs (HTTPS)
  egress {
    description = "HTTPS for health checks and AWS API calls"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Egress for DNS (UDP)
  egress {
    description = "DNS resolution"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Egress for DNS (TCP)
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
    path                = "/health"
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
