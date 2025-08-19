############################################################
# WAFv2 for CloudFront (Frontend) - CLOUDFRONT scope
############################################################

resource "aws_wafv2_web_acl" "frontend" {
  provider    = aws.us_east_1
  name        = "frontend-acl"
  scope       = "CLOUDFRONT"
  description = "Frontend WAF: managed rule groups + OPTIONS allow + rate limit"

  default_action {
    allow {}
  }

  rule {
    name     = "AllowCORSPreflight"
    priority = 0

    action {
      allow {}
    }

    statement {
      byte_match_statement {
        search_string         = "OPTIONS"
        positional_constraint = "EXACTLY"

        field_to_match {
          method {}
        }

        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AllowCORSPreflight"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitPerIP"
    priority = 5

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 1500
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitPerIP"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 10

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
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWS-AWSManagedRulesKnownBadInputsRuleSet"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "KnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWS-AWSManagedRulesAmazonIpReputationList"
    priority = 30

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "IpReputation"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWS-AWSManagedRulesSQLiRuleSet"
    priority = 40

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "SQLi"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "frontend-acl"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "frontend_cf_assoc" {
  provider     = aws.us_east_1
  resource_arn = aws_cloudfront_distribution.frontend.arn
  web_acl_arn  = aws_wafv2_web_acl.frontend.arn
}
