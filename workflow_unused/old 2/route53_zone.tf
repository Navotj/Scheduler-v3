############################################################
# Public Hosted Zone (Terraform-managed)
############################################################

resource "aws_route53_zone" "main" {
  name = var.domain_name
}
