# Updates the registrar’s NS to the zone’s NS (works only if the domain
# is registered in Route 53 Registrar under this AWS account).
resource "aws_route53domains_registered_domain" "this" {
  provider    = aws.us_east_1
  domain_name = "nat20scheduling.com"

  dynamic "name_server" {
    for_each = toset(aws_route53_zone.main.name_servers)
    content {
      name = name_server.value
    }
  }
}
