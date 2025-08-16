############################################################
# Data Sources (single definitions)
############################################################

data "aws_caller_identity" "current" {}

# Default VPC
data "aws_vpc" "default" {
  default = true
}

# Default subnets in 1a/1b
data "aws_subnet" "eu_central_1a" {
  filter { name = "availability-zone", values = ["eu-central-1a"] }
  filter { name = "default-for-az", values = ["true"] }
}

data "aws_subnet" "eu_central_1b" {
  filter { name = "availability-zone", values = ["eu-central-1b"] }
  filter { name = "default-for-az", values = ["true"] }
}

# Current region (used by CloudFront S3 origin domain)
data "aws_region" "current" {}

# Public hosted zone lookup (created in route53_zone.tf)
data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}
