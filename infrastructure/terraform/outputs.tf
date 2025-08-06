output "frontend_bucket_name" {
  description = "Name of the frontend S3 bucket"
  value       = aws_s3_bucket.frontend.bucket
}

output "s3_website_url" {
  description = "Static website URL"
  value       = "nat20scheduling.com.s3-website.eu-central-1.amazonaws.com"
}

output "backend_dns" {
  value = "backend.nat20scheduling.com"
}

output "mongodb_dns" {
  value = "mongo.nat20scheduling.com"
}

output "frontend_dns" {
  value = "nat20scheduling.com"
}

output "backend_instance_id" {
  value = aws_instance.backend.id
}

output "mongodb_instance_id" {
  value = aws_instance.mongodb.id
}
