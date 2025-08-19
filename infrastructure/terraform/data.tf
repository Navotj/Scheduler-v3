############################################################
# Data Sources
############################################################

data "aws_caller_identity" "current" {}

# Default VPC (reuse as in existing setup)
data "aws_vpc" "default" {
  default = true
}

# Default subnets in 1a/1b
data "aws_subnet" "eu_central_1a" {
  filter { name = "availability-zone"  values = ["eu-central-1a"] }
  filter { name = "default-for-az"     values = ["true"] }
}
data "aws_subnet" "eu_central_1b" {
  filter { name = "availability-zone"  values = ["eu-central-1b"] }
  filter { name = "default-for-az"     values = ["true"] }
}

data "aws_region" "current" {}

# CloudFront origin-facing managed prefix list (IPv4)
data "aws_ec2_managed_prefix_list" "cloudfront_origin" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# Public hosted zone (create if missing)
resource "aws_route53_zone" "main" {
  name = var.domain_name
}

# Registrar: set NS on registered domain to zone NS (if same account)
resource "aws_route53domains_registered_domain" "this" {
  provider    = aws.us_east_1
  domain_name = var.domain_name

  dynamic "name_server" {
    for_each = toset(aws_route53_zone.main.name_servers)
    content { name = name_server.value }
  }
}
