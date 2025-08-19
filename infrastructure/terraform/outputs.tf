############################################################
# Outputs
############################################################

output "eks_cluster_name" {
  value = aws_eks_cluster.this.name
}

output "api_acm_arn" {
  value = aws_acm_certificate.api.arn
}

output "origin_acm_arn" {
  value = aws_acm_certificate.origin.arn
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "api_domain" {
  value = "${var.api_subdomain}.${var.domain_name}"
}

output "origin_domain" {
  value = "${var.origin_subdomain}.${var.domain_name}"
}
