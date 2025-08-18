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

# Current region
data "aws_region" "current" {}

# CloudFront Managed policies
data "aws_cloudfront_cache_policy" "managed_caching_optimized" {
  id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
}

data "aws_cloudfront_cache_policy" "managed_caching_disabled" {
  id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
}

data "aws_cloudfront_origin_request_policy" "managed_all_viewer" {
  id = "216adef6-5c7f-47e4-b989-5492eafa07d3" # AllViewer
}

# CloudFront origin-facing managed prefix list (global, for IPv4)
data "aws_ec2_managed_prefix_list" "cloudfront_origin" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}
