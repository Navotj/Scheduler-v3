output "origin_cert_arn" {
  description = "ARN of the viewer certificate (us-east-1, for CloudFront)."
  value       = aws_acm_certificate.origin.arn
}

output "api_cert_arn" {
  description = "ARN of the API certificate (regional, for ALB)."
  value       = aws_acm_certificate.api.arn
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution for the frontend."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_hostname" {
  description = "Canonical hostname serving the SPA via CloudFront."
  value       = local.frontend_hostname
}

output "frontend_bucket_name" {
  description = "Name of the private S3 bucket used as the CloudFront origin."
  value       = aws_s3_bucket.frontend.bucket
}
