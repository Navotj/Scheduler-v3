variable "app_prefix" {
  description = "Prefix for naming resources (must be globally unique for S3)"
  type        = string
}


variable "ec2_instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "frontend_domain" {
  description = "Frontend domain (CloudFront)."
  type        = string
}

variable "api_domain" {
  description = "API domain (ALB)."
  type        = string
}
