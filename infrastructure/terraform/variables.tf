variable "app_prefix" {
  description = "Prefix for naming resources (must be globally unique for S3)"
  type        = string
}

variable "ec2_instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "root_domain" {
  description = "Apex domain that has the public Route 53 hosted zone (e.g., nat20scheduling.com)."
  type        = string
}

locals {
  origin_domain = "origin.${var.root_domain}"
  api_domain    = "api.${var.root_domain}"
}
