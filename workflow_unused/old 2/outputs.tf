############################################################
# Outputs
############################################################

output "frontend_bucket_name" {
  description = "Name of the frontend S3 bucket"
  value       = aws_s3_bucket.frontend.bucket
}

output "frontend_dns" {
  description = "Primary frontend domain served by CloudFront"
  value       = var.domain_name
}

output "backend_dns" {
  description = "Backend API domain"
  value       = "${var.api_subdomain}.${var.domain_name}"
}

output "backend_instance_id" {
  value = aws_instance.backend.id
}

output "mongodb_instance_id" {
  value = aws_instance.mongodb.id
}

output "backend_instance_ip" {
  value = try(aws_instance.backend.public_ip, "")
}

output "mongodb_instance_ip" {
  value = try(aws_instance.mongodb.public_ip, "")
}

output "backend_instance_private_ip" {
  value = aws_instance.backend.private_ip
}

output "mongodb_instance_private_ip" {
  value = aws_instance.mongodb.private_ip
}

output "mongodb_ebs_volume_id" {
  value = aws_ebs_volume.mongo_data.id
}
