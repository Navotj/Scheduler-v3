variable "domain_name" {
  description = "Base domain for the site (public hosted zone must already exist in Route53)"
  type        = string
  default     = "nat20scheduling.com"
}

variable "api_subdomain" {
  description = "Subdomain for the backend API"
  type        = string
  default     = "api"
}

variable "backend_port" {
  description = "TCP port your backend listens on"
  type        = number
  default     = 3000
}

variable "backend_health_check_path" {
  description = "HTTP path for ALB health check"
  type        = string
  default     = "/health"
}

variable "alarm_email" {
  description = "Email address to subscribe to CloudWatch alarms (leave empty to skip)"
  type        = string
  default     = ""
}

variable "mongo_db_name" {
  description = "MongoDB database name used by the app"
  type        = string
  default     = "nat20"
}

variable "backend_instance_role_name" {
  description = "IAM role name attached to the backend EC2 instance profile"
  type        = string
}
