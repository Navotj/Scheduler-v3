
resource "aws_eip" "mongodb" {
  instance = aws_instance.mongodb.id
  tags = {
    Name = "mongodb-eip"
  }
}

resource "aws_eip" "backend" {
  instance = aws_instance.backend.id
  tags = {
    Name = "backend-eip"
  }
}

resource "aws_route53_zone" "main" {
  name = "nat20scheduling.com"
}

resource "aws_route53domains_registered_domain" "main" {
  domain_name = "nat20scheduling.com"

  name_server {
    name = aws_route53_zone.main.name_servers[0]
  }

  name_server {
    name = aws_route53_zone.main.name_servers[1]
  }

  name_server {
    name = aws_route53_zone.main.name_servers[2]
  }

  name_server {
    name = aws_route53_zone.main.name_servers[3]
  }
}

resource "aws_route53_record" "mongo" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "mongo.nat20scheduling.com"
  type    = "A"
  ttl     = 300
  records = [aws_eip.mongodb.public_ip]
}

resource "aws_route53_record" "backend" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "backend.nat20scheduling.com"
  type    = "A"
  ttl     = 300
  records = [aws_eip.backend.public_ip]
}

resource "aws_route53_record" "frontend" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "nat20scheduling.com"
  type    = "A"

  alias {
    name                   = "s3-website.eu-central-1.amazonaws.com"
    zone_id                = "Z21DNDUVLTQW6Q" # Hosted Zone ID for S3 website in eu-central-1
    evaluate_target_health = false
  }
}
