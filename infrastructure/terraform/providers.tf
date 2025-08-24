provider "aws" {
  # Region comes from AWS_REGION env
  default_tags {
    tags = {
      App         = var.app_prefix
      ManagedBy   = "terraform"
      Terraform   = "true"
      Environment = "prod"
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
      ManagedBy   = "terraform"
      Terraform   = "true"
      Environment = "prod"
    }
  }
}
