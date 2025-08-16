############################################################
# Variables
############################################################

variable "domain_name" {
  description = "Base domain for the site (public hosted zone in Route 53)"
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

variable "attach_frontend_waf" {
  description = "Whether to attach a WAF to the CloudFront frontend"
  type        = bool
  default     = true
}

variable "frontend_waf_name" {
  description = "Name of the WAFv2 Web ACL (scope=CLOUDFRONT) to attach to CloudFront"
  type        = string
  default     = "nat20-frontend-waf"
}
