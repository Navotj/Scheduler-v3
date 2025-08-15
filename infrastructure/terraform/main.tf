############################################################
# Providers, Backend, and Global Settings
############################################################

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }

  backend "s3" {
    bucket         = "navot-terraform-state-1"
    key            = "mongodb/terraform.tfstate"
    region         = "eu-central-1"
    # Use native lockfile instead of deprecated DynamoDB param
    use_lockfile   = true
    encrypt        = true
  }
}

# Default provider (application region)
provider "aws" {
  region = "eu-central-1"
}

# us-east-1 for CloudFront/ACM/WAF scope=CLOUDFRONT
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# NOTE:
# - Shared data sources (VPC, subnet, caller identity, hosted zone) are defined
#   once in data_sources.tf to avoid duplicate data blocks.
# - All modules/resources should reference those singletons, e.g.:
#     data.aws_vpc.default.id
#     data.aws_subnet.eu_central_1b.id
#     data.aws_caller_identity.current.account_id
#     data.aws_route53_zone.main.zone_id
