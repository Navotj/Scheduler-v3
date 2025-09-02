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

variable "database_host" {
  description = "Fixed ip for database"
  type        = string
  sensitive   = true
}

variable "origin_secret" {
  description = "Shared secret that CloudFront adds as X-Origin-Secret when calling the API origin."
  type        = string
  sensitive   = true
}

# Optional secrets passed through to backend user-data; empty string is acceptable.
variable "jwt_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "oauth_google_client_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "oauth_google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "oauth_github_client_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "oauth_github_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "oauth_discord_client_id" {
  type      = string
  default   = ""
  sensitive = true
}

variable "oauth_discord_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}
