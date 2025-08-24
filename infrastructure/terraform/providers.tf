provider "aws" {
  # Region comes from AWS_REGION env
  default_tags {
    tags = {
      App         = var.app_prefix
      Environment = var.environment
      ManagedBy   = "terraform"
      Terraform   = "true"
    }
  }
}

# us-east-1 for CloudFront/ACM viewer cert
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      App         = var.app_prefix
      Environment = var.environment
      ManagedBy   = "terraform"
      Terraform   = "true"
    }
  }
}
