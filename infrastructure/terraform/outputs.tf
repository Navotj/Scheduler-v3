output "origin_cert_arn" {
  description = "ARN of the origin certificate (in us-east-1, for CloudFront)."
  value       = aws_acm_certificate.origin.arn
}

output "api_cert_arn" {
  description = "ARN of the API certificate (in the default region, for ALB)."
  value       = aws_acm_certificate.api.arn
}
