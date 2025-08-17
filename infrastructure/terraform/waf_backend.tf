############################################################
# WAFv2 for ALB (Backend API)
# - Managed rules (conservative)
# - Explicit allows for ALB health checks and CORS preflight
# - Per-IP rate limiting
# - Mongo-aware NoSQLi guards (regex on $operators + JSON-only writes)
############################################################

resource "aws_wafv2_web_acl" "backend" {
  name        = "backend-acl"
  scope       = "REGIONAL"
  description = "Backend WAF: managed rule groups + healthcheck/OPTIONS allow + rate limit + Mongo-safe guards"

  default_action {
    allow {}
  }

  # 0 - Allow ALB health checks (User-Agent contains ELB-HealthChecker)
  rule {
    name     = "AllowALBHealthChecks"
    priority = 0

    action {
      allow {}
    }

    statement {
      byte_match_statement {
        search_string         = "ELB-HealthChecker"
        positional_constraint = "CONTAINS"

        field_to_match {
          single_header {
            name = "user-agent"
          }
        }

        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AllowALBHealthChecks"
      sampled_requests_enabled   = true
    }
  }

  # 1 - Always allow CORS preflight requests
  rule {
    name     = "AllowCORSPreflight"
    priority = 1

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

  # 5 - IP rate limiting (API-safe baseline)
  rule {
    name     = "RateLimitPerIP"
    priority = 5

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000 # requests per 5 minutes per IP
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitPerIP"
      sampled_requests_enabled   = true
    }
  }

  # 6 - Block common Mongo operator injection in query string and body
  rule {
    name     = "BlockMongoOperatorsInInputs"
    priority = 6

    action {
      block {}
    }

    statement {
      or_statement {
        statements {
          regex_match_statement {
            regex_string = "(?i)\\$(ne|gt|gte|lt|lte|in|nin|or|and|where)\\b"

            field_to_match {
              query_string {}
            }

            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
        statements {
          regex_match_statement {
            regex_string = "(?i)\\$(ne|gt|gte|lt|lte|in|nin|or|and|where)\\b"

            field_to_match {
              body {}
            }

            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "BlockMongoOperatorsInInputs"
      sampled_requests_enabled   = true
    }
  }

  # 7 - Require JSON for write methods (block non-JSON on POST/PUT/PATCH)
  rule {
    name     = "RequireJsonOnWriteMethods"
    priority = 7

    action {
      block {}
    }

    statement {
      and_statement {
        statements {
          or_statement {
            statements {
              byte_match_statement {
                search_string         = "POST"
                positional_constraint = "EXACTLY"
                field_to_match { method {} }
                text_transformation { priority = 0 type = "NONE" }
              }
            }
            statements {
              byte_match_statement {
                search_string         = "PUT"
                positional_constraint = "EXACTLY"
                field_to_match { method {} }
                text_transformation { priority = 0 type = "NONE" }
              }
            }
            statements {
              byte_match_statement {
                search_string         = "PATCH"
                positional_constraint = "EXACTLY"
                field_to_match { method {} }
                text_transformation { priority = 0 type = "NONE" }
              }
            }
          }
        }
        statements {
          not_statement {
            statement {
              byte_match_statement {
                search_string         = "application/json"
                positional_constraint = "CONTAINS"

                field_to_match {
                  single_header { name = "content-type" }
                }

                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RequireJsonOnWriteMethods"
      sampled_requests_enabled   = true
    }
  }

  # 8 - JSON body oversize handling (block if body too large/invalid to inspect)
  rule {
    name     = "LimitJsonBodySize"
    priority = 8

    action {
      block {}
    }

    statement {
      byte_match_statement {
        search_string         = "{"
        positional_constraint = "STARTS_WITH"

        field_to_match {
          json_body {
            match_scope                = "ALL"
            invalid_fallback_behavior  = "MATCH"
            oversize_handling          = "MATCH"
          }
        }

        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "LimitJsonBodySize"
      sampled_requests_enabled   = true
    }
  }

  # 10 - Core protections
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

  # 20 - Known bad inputs
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

  # 30 - IP reputation
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

  # 40 - SQL injection detection
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
    metric_name                = "backend-acl"
    sampled_requests_enabled   = true
  }
}
