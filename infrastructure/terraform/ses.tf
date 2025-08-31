resource "aws_sesv2_email_identity" "domain" {
  email_identity = data.aws_route53_zone.root.name
}

# DKIM records for SES (3 CNAMEs)
resource "aws_route53_record" "ses_dkim" {
  for_each = toset(aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens)
  zone_id  = data.aws_route53_zone.root.zone_id
  name     = "${each.value}._domainkey.${data.aws_route53_zone.root.name}"
  type     = "CNAME"
  ttl      = 300
  records  = ["${each.value}.dkim.amazonses.com"]
}

# Optional MAIL FROM domain can be added later if desired
