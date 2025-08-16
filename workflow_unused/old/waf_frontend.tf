############################################################
# WAF for Frontend CloudFront
############################################################

resource "aws_wafv2_web_acl" "frontend" {
  count       = var.attach_frontend_waf ? 1 : 0
  name        = var.frontend_waf_name
  scope       = "CLOUDFRONT"
  description = "WAF for frontend CloudFront"

  default_action {
    allow {}
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "frontend-waf"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "frontend" {
  count        = var.attach_frontend_waf ? 1 : 0
  resource_arn = aws_cloudfront_distribution.frontend.arn
  web_acl_arn  = aws_wafv2_web_acl.frontend[0].arn
}
