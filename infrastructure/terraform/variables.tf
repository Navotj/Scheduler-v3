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
  description = "Apex domain that has the public Route 53 hosted zone."
  type        = string
}

locals {
  api_domain        = "api.${var.root_domain}"
  frontend_hostname = "www.${var.root_domain}"
}

variable "database_user" {
  description = "MongoDB application username"
  type        = string
  sensitive   = true
}

variable "database_password" {
  description = "MongoDB application password"
  type        = string
  sensitive   = true
}

variable "serial_console_password" {
  description = "Temporary password for ec2-user to allow Serial Console login (leave empty to skip)."
  type        = string
  sensitive   = true
  default     = ""
}
