###############################################
# WAFv2 (REGIONAL) for the backend ALB
# - Blocks all requests by default
# - Allows only requests that carry the exact X-EDGE-KEY header value
# - Attach to the ALB
#
# NOTE:
# - Do NOT redeclare variables here. "cloudfront_backend_edge_key"
#   must already exist in variables.tf
# - Make sure the ALB resource name below matches your ALB (aws_lb.backend)
###############################################

resource "aws_wafv2_web_acl" "backend_alb" {
  name        = "nat20-backend-alb-waf"
  description = "Allow only CloudFront with secret header"
  scope       = "REGIONAL"

  # Block everything by default
  default_action {
    block {
    }
  }

  # Allow when X-EDGE-KEY header matches var.cloudfront_backend_edge_key
  rule {
    name     = "AllowWithSecretHeader"
    priority = 1

    action {
      allow {
      }
    }

    statement {
      byte_match_statement {
        search_string = var.cloudfront_backend_edge_key

        field_to_match {
          single_header {
            # Header names must be lowercase per AWS docs
            name = "x-edge-key"
          }
        }

        positional_constraint = "EXACTLY"

        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AllowWithSecretHeader"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "backendAlbWaf"
    sampled_requests_enabled   = true
  }
}

# Associate the WAF ACL with the backend ALB
# Make sure this references the correct ALB resource in your codebase.
resource "aws_wafv2_web_acl_association" "backend_alb_assoc" {
  resource_arn = aws_lb.backend.arn
  web_acl_arn  = aws_wafv2_web_acl.backend_alb.arn
}
