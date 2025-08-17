############################################################
# Private DNS for MongoDB inside the VPC
# - Creates a Private Hosted Zone for var.domain_name
# - Adds A record: mongo.<domain> -> EC2 Mongo instance private IP
# Requirements (already in your stack based on prior files/logs):
#   - data.aws_vpc.default
#   - aws_instance.mongodb
############################################################

# Private Hosted Zone for internal records (VPC-only)
resource "aws_route53_zone" "private" {
  name         = var.domain_name

  vpc {
    vpc_id = data.aws_vpc.default.id
  }

  tags = {
    Name = "nat20-private-zone"
  }
}

# Mongo A record -> instance private IP (resolvable only inside the VPC)
resource "aws_route53_record" "mongo_private_a" {
  zone_id = aws_route53_zone.private.zone_id
  name    = "mongo.${var.domain_name}"
  type    = "A"
  ttl     = 60
  records = [aws_instance.mongodb.private_ip]
}
