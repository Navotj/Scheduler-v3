# Allow CloudFront origin-facing IPs to reach the ALB on 443.
# Reuses existing data sources:
# - data.aws_lb.backend                         (declared in acm_cloudfront.tf)
# - data.aws_ec2_managed_prefix_list.cloudfront_origin  (declared in alb_backend.tf)

resource "aws_security_group_rule" "alb_ingress_cf_https" {
  for_each          = toset(data.aws_lb.backend.security_groups)

  type              = "ingress"
  protocol          = "tcp"
  from_port         = 443
  to_port           = 443
  security_group_id = each.value

  # AWS-managed CloudFront origin-facing prefix list (already defined in alb_backend.tf)
  prefix_list_ids   = [data.aws_ec2_managed_prefix_list.cloudfront_origin.id]

  description       = "Allow CloudFront origin-facing IPs to connect to ALB on 443"
}
