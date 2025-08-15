###############################################
# Outputs (match workflows; no sensitive data)
###############################################

output "frontend_bucket_name" {
  description = "Name of the frontend S3 bucket"
  value       = aws_s3_bucket.frontend.bucket
}

# CloudFront serves the site; S3 static website endpoint is not used.
output "frontend_dns" {
  description = "Primary frontend domain served by CloudFront"
  value       = var.domain_name
}

# Backend API domain (behind ALB HTTPS)
output "backend_dns" {
  description = "Backend API domain"
  value       = "${var.api_subdomain}.${var.domain_name}"
}

# Instance IDs
output "backend_instance_id" {
  value = aws_instance.backend.id
}

output "mongodb_instance_id" {
  value = aws_instance.mongodb.id
}

# Public IPs (if any)
output "backend_instance_ip" {
  value = try(aws_instance.backend.public_ip, "")
}

output "mongodb_instance_ip" {
  value = try(aws_instance.mongodb.public_ip, "")
}

# Private IPs
output "backend_instance_private_ip" {
  value = aws_instance.backend.private_ip
}

output "mongodb_instance_private_ip" {
  value = aws_instance.mongodb.private_ip
}

# MongoDB EBS volume id (for backup/ops)
output "mongodb_ebs_volume_id" {
  value = aws_ebs_volume.mongo_data.id
}
