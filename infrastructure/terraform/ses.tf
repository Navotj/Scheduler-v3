#############################
# SES identity (in-region)  #
#############################

# Region to create the SES identity in. MUST match what your app uses (SES_REGION env).
variable "ses_region" {
  type    = string
  default = "eu-central-1"
}

# Dedicated provider alias for SES, to avoid mixing with your default region.
provider "aws" {
  alias  = "ses"
  region = var.ses_region
}

# Reuse your existing public hosted zone (declared in route53.tf as data.aws_route53_zone.root)
# - No duplicate data source defined here to avoid conflicts.

# Create a DOMAIN identity for nat20scheduling.com in the SES region above.
resource "aws_sesv2_email_identity" "domain" {
  provider       = aws.ses
  email_identity = data.aws_route53_zone.root.name
}

# DKIM CNAMEs (always 3). Use count with index so plan works before tokens are known.
resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${data.aws_route53_zone.root.name}"
  type    = "CNAME"
  ttl     = 300
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}
