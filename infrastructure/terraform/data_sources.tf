###############################################
# Shared Data Sources (single definitions)
###############################################

# Default VPC
data "aws_vpc" "default" {
  default = true
}

# Subnet in eu-central-1a (default subnet for the AZ)
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

# Subnet in eu-central-1b (default subnet for the AZ)
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

# Caller identity (account id, etc.)
data "aws_caller_identity" "current" {}

# Public hosted zone for your domain
data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}
