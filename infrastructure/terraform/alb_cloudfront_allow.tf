# Allow CloudFront edge -> ALB 443 via AWS-managed prefix list

# Your ALB (already exists)
data "aws_lb" "backend" {
  name = "nat20-backend-alb"
}

# All CloudFront origin-facing IP ranges (AWS-managed and auto-updated)
data "aws_ec2_managed_prefix_list" "cloudfront_origin" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# Add an ingress rule on every SG attached to the ALB
resource "aws_security_group_rule" "alb_ingress_cf_https" {
  for_each          = toset(data.aws_lb.backend.security_groups)
  type              = "ingress"
  protocol          = "tcp"
  from_port         = 443
  to_port           = 443
  security_group_id = each.value
  prefix_list_ids   = [data.aws_ec2_managed_prefix_list.cloudfront_origin.id]
  description       = "Allow CloudFront origin-facing IPs to connect to ALB on 443"
}
