############################################################
# WAFv2 for CloudFront (Frontend) - CLOUDFRONT scope
# - Tightened rate limit
# - Adds AWSManagedRulesAnonymousIpList
# - Creation is toggleable via var.attach_frontend_waf
############################################################

resource "aws_wafv2_web_acl" "frontend" {
  provider  = aws.us_east_1
  count     = var.attach_frontend_waf ? 1 : 0
  name      = var.frontend_waf_name
  scope     = "CLOUDFRONT"
  description = "Frontend WAF: managed rule groups + OPTIONS allow + tightened rate limit + anonymous IP block"

  default_action { allow {} }

  # Allow CORS preflight so browsers can probe freely
  rule {
    name     = "AllowCORSPreflight"
    priority = 0

    action { allow {} }

    statement {
      byte_match_statement {
        search_string         = "OPTIONS"
        positional_constraint = "EXACTLY"

        field_to_match { method {} }

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

  # Tightened to 1000 requests / 5 min / IP
  rule {
    name     = "RateLimitPerIP"
    priority = 5

    action { block {} }

    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitPerIP"
      sampled_requests_enabled   = true
    }
  }

  # AWS managed rules (no extra rule-group charges)
  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 10

    override_action { none {} }

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

  # NEW: block anonymous / VPN / proxy sources
  rule {
    name     = "AWS-AWSManagedRulesAnonymousIpList"
    priority = 15

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAnonymousIpList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AnonymousIpList"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWS-AWSManagedRulesKnownBadInputsRuleSet"
    priority = 20

    override_action { none {} }

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

    override_action { none {} }

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

    override_action { none {} }

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
    metric_name                = var.frontend_waf_name
    sampled_requests_enabled   = true
  }
}
