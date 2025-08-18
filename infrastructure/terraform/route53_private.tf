############################################################
# Private DNS for MongoDB inside the VPC
# - Private Hosted Zone for var.domain_name
# - A record: mongo.<domain> -> EC2 Mongo instance private IP
############################################################

resource "aws_route53_zone" "private" {
  name = var.domain_name
  vpc {
    vpc_id = data.aws_vpc.default.id
  }
  tags = { Name = "nat20-private-zone" }
}

resource "aws_route53_record" "mongo_private_a" {
  zone_id = aws_route53_zone.private.zone_id
  name    = "mongo.${var.domain_name}"
  type    = "A"
  ttl     = 60
  records = [aws_instance.mongodb.private_ip]
}

# SSM Parameter for logical Mongo host
resource "aws_ssm_parameter" "mongo_host" {
  name        = "/nat20/mongo/HOST"
  description = "MongoDB hostname resolved via Route53 Private Hosted Zone"
  type        = "String"
  value       = "mongo.${var.domain_name}"
  overwrite   = true
  tags        = { Name = "mongo-host" }
}
