############################################################
# Data Sources
############################################################

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

# Default VPC
data "aws_vpc" "default" {
  default = true
}

# Default subnets in 1a/1b
data "aws_subnet" "eu_central_1a" {
  filter {
    name   = "availability-zone"
    values = ["eu-central-1a"]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

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

# CloudFront origin-facing managed prefix list (global, IPv4)
data "aws_ec2_managed_prefix_list" "cloudfront_origin" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# Public hosted zone (Terraform-managed)
resource "aws_route53_zone" "main" {
  name = var.domain_name
}

# Registrar NS sync (if same account)
resource "aws_route53domains_registered_domain" "this" {
  provider    = aws.us_east_1
  domain_name = var.domain_name

  dynamic "name_server" {
    for_each = toset(aws_route53_zone.main.name_servers)
    content {
      name = name_server.value
    }
  }
}
