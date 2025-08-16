############################################################
# Public Hosted Zone (Terraform-managed)
############################################################

resource "aws_route53_zone" "main" {
  name = "nat20scheduling.com"
}