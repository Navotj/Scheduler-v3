variable "app_prefix" {
  description = "Prefix for naming resources (must be globally unique for S3)"
  type        = string
}

variable "aws_region" {
  description = "AWS region for endpoints, e.g., eu-central-1"
  type        = string
}

variable "environment" {
  description = "Environment for workload"
  type        = string
}

variable "ec2_instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "root_domain" {
  description = "Apex domain that has the public Route 53 hosted zone."
  type        = string
}

locals {
  api_domain        = "api.${var.root_domain}"
  frontend_hostname = "www.${var.root_domain}"
}

variable "cloudfront_origin_prefix_list_id" {
  description = "AWS-managed prefix list ID for com.amazonaws.global.cloudfront.origin-facing (IPv4) in your region"
  type        = string
}
