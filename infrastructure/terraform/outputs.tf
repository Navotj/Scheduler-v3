output "origin_cert_arn" {
  description = "ARN of the origin certificate (in us-east-1, for CloudFront)."
  value       = aws_acm_certificate.origin.arn
}

output "api_cert_arn" {
  description = "ARN of the API certificate (in the default region, for ALB)."
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

output "frontend_hostnames" {
  description = "Hostnames serving the SPA via CloudFront."
  value       = [var.root_domain, "www.${var.root_domain}", local.origin_domain]
}

output "frontend_bucket_name" {
  description = "Name of the private S3 bucket used as the CloudFront origin."
  value       = aws_s3_bucket.frontend.bucket
}
