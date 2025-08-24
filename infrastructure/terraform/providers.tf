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

# us-east-1 alias for resources that must live there (CloudFront/ACM)
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
