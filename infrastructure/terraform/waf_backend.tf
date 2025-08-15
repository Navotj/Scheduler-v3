###############################################
# WAFv2 for ALB: Require secret header from CloudFront
###############################################

# Secret passed from CloudFront to ALB via custom header
variable "cloudfront_backend_edge_key" {
  description = "Shared secret header value that CloudFront sends to ALB"
  type        = string
}

resource "aws_wafv2_web_acl" "backend_alb" {
  name        = "nat20-backend-alb-waf"
  description = "Only allow requests with X-EDGE-KEY header; block all others"
  scope       = "REGIONAL"

  default_action { block {} }

  rule {
    name     = "AllowWithSecretHeader"
    priority = 1
    action { allow {} }

    statement {
      byte_match_statement {
        search_string = var.cloudfront_backend_edge_key
        field_to_match { single_header { name = "x-edge-key" } }
        positional_constraint = "EXACTLY"
        text_transformation { priority = 0, type = "NONE" }
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

# Associate WAF with the ALB
resource "aws_wafv2_web_acl_association" "backend_alb_assoc" {
  resource_arn = aws_lb.api.arn
  web_acl_arn  = aws_wafv2_web_acl.backend_alb.arn
}
