############################################################
# Route 53 records
# - apex + www  -> CloudFront distribution (frontend)
# - api         -> ALB (backend origin host)
############################################################

variable "domain_name" {
  description = "Root domain (e.g., nat20scheduling.com)"
  type        = string
}

variable "api_subdomain" {
  description = "Subdomain for API (e.g., api)"
  type        = string
  default     = "api"
}

# ALB name (as seen in AWS console/CLI). Default matches your current ALB.
variable "backend_alb_name" {
  description = "Application Load Balancer name for backend"
  type        = string
  default     = "nat20-backend-alb"
}

# Lookup hosted zone created in route53_zone.tf
data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

# Lookup the backend ALB by name
data "aws_lb" "backend" {
  name = var.backend_alb_name
}

############################################################
# Apex -> CloudFront
############################################################
resource "aws_route53_record" "apex_a" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = data.aws_route53_zone.main.name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = "Z2FDTNDATAQYW2" # CloudFront hosted zone ID (global)
    evaluate_target_health = false
  }

  allow_overwrite = true
}

############################################################
# www -> CloudFront
############################################################
resource "aws_route53_record" "www_a" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }

  allow_overwrite = true
}

############################################################
# api -> ALB (backend origin host for /auth/*)
############################################################
resource "aws_route53_record" "api_a" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = data.aws_lb.backend.dns_name
    zone_id                = data.aws_lb.backend.zone_id
    evaluate_target_health = true
  }

  allow_overwrite = true
}
