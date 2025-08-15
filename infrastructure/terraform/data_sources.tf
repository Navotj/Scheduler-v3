###############################################
# Shared Data Sources (single definitions)
###############################################

# Default VPC and a commonly used subnet (already referenced elsewhere)
data "aws_vpc" "default" {
  default = true
}

# If you rely on a specific subnet/az, keep these matching your current setup
data "aws_subnet" "eu_central_1b" {
  filter {
    name   = "availability-zone"
    values = ["eu-central-1b"]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# Caller identity (used by IAM/logging)
data "aws_caller_identity" "current" {}

# Public hosted zone for your domain (reused by CF + ALB DNS)
data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}
