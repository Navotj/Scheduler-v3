############################################################
# Variables for WAF
############################################################

variable "backend_alb_name" {
  type        = string
  description = "Name of the backend ALB to attach WAF"
}

variable "frontend_waf_name" {
  type        = string
  description = "Name of the WAF for frontend CloudFront"
  default     = "nat20-frontend-cf-waf"
}

variable "attach_frontend_waf" {
  type        = bool
  description = "Whether to attach WAF to frontend CloudFront"
  default     = false
}
