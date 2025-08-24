# CloudFront cert (must be in us-east-1)
data "aws_acm_certificate" "frontend" {
  provider    = aws.us_east_1
  domain      = var.frontend_domain           # e.g. "origin.nat20scheduling.com"
  statuses    = ["ISSUED"]
  most_recent = true
}

# ALB/API cert (regional)
data "aws_acm_certificate" "api" {
  domain      = var.api_domain                # e.g. "api.nat20scheduling.com"
  statuses    = ["ISSUED"]
  most_recent = true
}
