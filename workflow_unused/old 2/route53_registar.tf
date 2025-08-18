############################################################
# Registrar: set NS on registered domain to zone NS (if same account)
############################################################

resource "aws_route53domains_registered_domain" "this" {
  provider    = aws.us_east_1
  domain_name = var.domain_name

  dynamic "name_server" {
    for_each = toset(aws_route53_zone.main.name_servers)
    content {
      name = name_server.value
    }
  }
}
