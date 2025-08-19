############################################################
# Variables
############################################################

variable "project_name" {
  description = "Project name prefix for tagging/naming."
  type        = string
  default     = "nat20"
}

variable "domain_name" {
  description = "Base domain for the site (public hosted zone in Route 53)"
  type        = string
  default     = "nat20scheduling.com"
}

variable "api_subdomain" {
  description = "Subdomain for the backend API (ALB origin for API)"
  type        = string
  default     = "api"
}

variable "origin_subdomain" {
  description = "Subdomain for the frontend origin (ALB origin for frontend)"
  type        = string
  default     = "origin"
}

variable "eks_version" {
  description = "Kubernetes version for EKS."
  type        = string
  default     = "1.29"
}

variable "node_instance_types" {
  description = "Instance types for managed node group."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "desired_capacity" {
  description = "Desired node count for the managed node group."
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Min node count."
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Max node count."
  type        = number
  default     = 4
}
