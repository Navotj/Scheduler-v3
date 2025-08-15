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

# Whether to create a public DNS A-record for the API origin (api.<domain>) pointing to the ALB.
# Leave false to avoid publishing a public record; set true if CloudFront will use this hostname as origin.
variable "create_api_alias" {
  description = "Control creation of Route53 A record for api.<domain> -> ALB"
  type        = bool
  default     = false
}

# Shared secret header that CloudFront sends to ALB (matched by WAF).
variable "cloudfront_backend_edge_key" {
  description = "Secret value for X-EDGE-KEY header from CloudFront to ALB"
  type        = string
}
