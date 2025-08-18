############################################################
# Allow IPv6 HTTPS to the ALB (for CloudFront dualstack origin fetches)
# Reuses existing data.aws_lb.backend (nat20-backend-alb)
############################################################

resource "aws_security_group_rule" "alb_ingress_https_ipv6" {
  for_each = toset(data.aws_lb.backend.security_groups)

  type              = "ingress"
  protocol          = "tcp"
  from_port         = 443
  to_port           = 443
  security_group_id = each.value

  # No AWS-managed IPv6 prefix list for CloudFront origin-facing ranges,
  # so open IPv6 HTTPS. (If you want to restrict further, use AWS WAF on the ALB.)
  ipv6_cidr_blocks  = ["::/0"]

  description       = "Allow IPv6 HTTPS to ALB for CloudFront dualstack origin connections"
}
