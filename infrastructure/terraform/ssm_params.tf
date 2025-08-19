############################################################
# Expose key ARNs/IDs for CI via SSM parameters
############################################################

resource "aws_ssm_parameter" "api_cert_arn" {
  name        = "/nat20/network/API_CERT_ARN"
  description = "ACM ARN for api.<domain> (ALB listener)"
  type        = "String"
  value       = aws_acm_certificate.api.arn
  overwrite   = true
}

resource "aws_ssm_parameter" "origin_cert_arn" {
  name        = "/nat20/network/ORIGIN_CERT_ARN"
  description = "ACM ARN for origin.<domain> (ALB listener)"
  type        = "String"
  value       = aws_acm_certificate.origin.arn
  overwrite   = true
}

resource "aws_ssm_parameter" "alb_backend_sg_id" {
  name        = "/nat20/network/ALB_BACKEND_SG_ID"
  description = "Security group ID for backend ALB"
  type        = "String"
  value       = aws_security_group.alb_backend.id
  overwrite   = true
}

resource "aws_ssm_parameter" "alb_frontend_sg_id" {
  name        = "/nat20/network/ALB_FRONTEND_SG_ID"
  description = "Security group ID for frontend ALB"
  type        = "String"
  value       = aws_security_group.alb_frontend.id
  overwrite   = true
}
