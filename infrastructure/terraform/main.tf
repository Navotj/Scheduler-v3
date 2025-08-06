provider "aws" {
  region = "eu-central-1"
}

terraform {
  backend "s3" {
    bucket         = "navot-terraform-state-1"
    key            = "mongodb/terraform.tfstate"
    region         = "eu-central-1"
    dynamodb_table = "terraform-lock-table"
    encrypt        = true
  }
}

data "aws_vpc" "default" {
  default = true
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