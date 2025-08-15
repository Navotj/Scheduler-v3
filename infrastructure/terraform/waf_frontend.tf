# ------------------------------------------
# CloudFront WAF (Frontend)
# ------------------------------------------

resource "aws_wafv2_web_acl" "frontend" {
  name        = "nat20-frontend-cf-waf"
  description = "WAF for CloudFront frontend distribution"
  scope       = "CLOUDFRONT"
  default_action {
    allow {}
  }

  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "frontend-commonrules"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "frontend"
    sampled_requests_enabled   = true
  }
}

# Associate the WAF with your CloudFront distribution
resource "aws_wafv2_web_acl_association" "frontend_cf" {
  resource_arn = aws_cloudfront_distribution.frontend.arn
  web_acl_arn  = aws_wafv2_web_acl.frontend.arn
}
