############################################################
# WAF for Backend ALB
############################################################

resource "aws_wafv2_web_acl" "backend" {
  name        = "nat20-backend-waf"
  scope       = "REGIONAL"
  description = "WAF for backend ALB"

  default_action {
    allow {}
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "backend-waf"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "backend" {
  resource_arn = aws_lb.api.arn
  web_acl_arn  = aws_wafv2_web_acl.backend.arn
}
