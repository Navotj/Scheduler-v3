variable "project_name" {
  description = "Name prefix for all resources"
  type        = string
  default     = "nat20"
}

variable "domain_name" {
  description = "Base domain for Route53 hosted zone and CloudFront alias"
  type        = string
  default     = "nat20scheduling.com"
}

variable "api_subdomain" {
  description = "Subdomain for backend API (CloudFront -> backend ALB origin)"
  type        = string
  default     = "api"
}

variable "origin_subdomain" {
  description = "Subdomain for frontend origin (CloudFront -> frontend ALB origin)"
  type        = string
  default     = "origin"
}

variable "eks_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.33"
}

variable "node_instance_types" {
  description = "Instance types for the node group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "desired_capacity" {
  description = "Desired node count"
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum node count"
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum node count"
  type        = number
  default     = 3
}

variable "attach_frontend_waf" {
  description = "Whether to attach WAF to the CloudFront distribution"
  type        = bool
  default     = true
}

variable "frontend_waf_name" {
  description = "Name of the WAFv2 Web ACL (scope=CLOUDFRONT) to attach to CloudFront"
  type        = string
  default     = "nat20-frontend-waf"
}

variable "backend_health_check_path" {
  description = "HTTP path for backend ALB health check"
  type        = string
  default     = "/health"
}

variable "install_addons" {
  description = "Install Helm/K8s addons (set to true on a second apply after the cluster is ACTIVE)"
  type        = bool
  default     = false
}
