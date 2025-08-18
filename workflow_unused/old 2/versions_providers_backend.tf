############################################################
# Terraform + Providers + Backend
############################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket         = "navot-terraform-state-1"
    key            = "terraform.tfstate"
    region         = "eu-central-1"
    dynamodb_table = "terraform-lock-table"
    encrypt        = true
  }
}

provider "aws" {
  region = "eu-central-1"
}

# CloudFront/WAF/ACM(for CF) live in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
