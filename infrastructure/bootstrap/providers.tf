terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.10"
    }
  }
  required_version = ">= 1.2"
}

provider "aws" {
  # Region comes directly from AWS_REGION environment variable
  default_tags {
    tags = {
      App         = var.app_prefix
      ManagedBy   = "terraform"
      Terraform   = "true"
      Environment = "prod"
    }
  }
}
