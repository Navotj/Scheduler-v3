variable "project_name" { description = "Name prefix for all resources"; type = string; default = "nat20" }

variable "domain_name"  { description = "Base domain for Route53 hosted zone and CloudFront alias"; type = string; default = "nat20scheduling.com" }
variable "api_subdomain"    { description = "Subdomain for backend API (CloudFront -> backend ALB origin)"; type = string; default = "api" }
variable "origin_subdomain" { description = "Subdomain for frontend origin (CloudFront -> frontend ALB origin)"; type = string; default = "origin" }

variable "eks_version" { description = "EKS Kubernetes version"; type = string; default = "1.33" }
variable "node_instance_types" { description = "Instance types for the node group"; type = list(string); default = ["t3.medium"] }

variable "desired_capacity" { description = "Desired node count"; type = number; default = 2 }
variable "min_capacity"     { description = "Minimum node count"; type = number; default = 2 }
variable "max_capacity"     { description = "Maximum node count"; type = number; default = 3 }

# ↓ Save cost: don’t attach WAF unless you opt-in
variable "attach_frontend_waf" {
  description = "Whether to attach WAF to the CloudFront distribution"
  type        = bool
  default     = false
}

variable "frontend_waf_name" {
  description = "Name of the WAFv2 Web ACL (scope=CLOUDFRONT) to attach to CloudFront"
  type        = string
  default     = "nat20-frontend-waf"
}

variable "backend_health_check_path" { description = "HTTP path for backend ALB health check"; type = string; default = "/health" }

# Keep logs but feel free to drop this lower to save a bit more CWL storage
variable "log_retention_days" { description = "CloudWatch retention for EKS control plane logs"; type = number; default = 14 }

# API CIDR allowlist knobs
variable "eks_api_allowed_cidrs_ssm_name" { description = "SSM parameter name with comma-separated CIDRs allowed to the public EKS API endpoint"; type = string; default = "/nat20/network/EKS_API_ALLOWED_CIDRS" }
variable "use_ssm_api_cidrs" { description = "If true, read API allowlist from SSM; if false, use var.api_allowed_cidrs"; type = bool; default = false }
variable "api_allowed_cidrs" { description = "Explicit list of CIDRs when SSM is not used."; type = list(string); default = [] }
