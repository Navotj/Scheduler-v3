# EIPs removed for MongoDB and Backend to reduce public exposure (Mongo is SSM-only; Backend remains reachable via its public interface or can be fronted by ALB later).
# If you still need the backend EIP for now, reintroduce only that resource and its A record.

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

# MongoDB record removed to avoid exposing the DB publicly; access is via SSM port forwarding only.

# Backend record: if backend keeps a public IP, point this at that IP (A record).
# If you add an ALB later, switch this to an alias to the ALB DNS name.
# Temporarily pointing to the instance public DNS (not recommended long-term). Replace with your current backend public DNS or re-add an EIP.
# Example using instance public DNS via CNAME:
resource "aws_route53_record" "backend" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "backend.nat20scheduling.com"
  type    = "CNAME"
  ttl     = 60
  records = [aws_instance.backend.public_dns]
}

# Root domain to S3 website hosting
resource "aws_route53_record" "frontend" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "nat20scheduling.com"
  type    = "A"

  alias {
    name                   = "s3-website.eu-central-1.amazonaws.com"
    zone_id                = "Z21DNDUVLTQW6Q"
    evaluate_target_health = false
  }
}
