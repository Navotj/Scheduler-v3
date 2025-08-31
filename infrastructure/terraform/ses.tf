resource "aws_sesv2_email_identity" "domain" {
  email_identity = data.aws_route53_zone.root.name
}

# DKIM records (3 CNAMEs). Use count (static keys) so planning works before tokens are known.
resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${data.aws_route53_zone.root.name}"
  type    = "CNAME"
  ttl     = 300
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}
