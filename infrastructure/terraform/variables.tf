variable "app_prefix" {
  type = string
}

variable "root_domain" {
  type = string
}

variable "ec2_instance_type" {
  type = string
}

locals {
  origin_domain = "origin.${var.root_domain}"
  api_domain    = "api.${var.root_domain}"
}
