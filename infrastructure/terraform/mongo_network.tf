###############################################
# Mongo DNS (private) + instance lookups
###############################################

# Discover Mongo instance by Name tag
data "aws_instances" "mongo" {
  instance_tags = { Name = "terraform-mongo" }
  filter {
    name   = "instance-state-name"
    values = ["pending", "running", "stopped", "stopping"]
  }
  most_recent = true
}

data "aws_instance" "mongo" {
  instance_id = data.aws_instances.mongo.ids[0]
}

# Discover Backend instance by Name tag
data "aws_instances" "backend" {
  instance_tags = { Name = "terraform-backend" }
  filter {
    name   = "instance-state-name"
    values = ["pending", "running", "stopped", "stopping"]
  }
  most_recent = true
}

data "aws_instance" "backend" {
  instance_id = data.aws_instances.backend.ids[0]
}

# Private hosted zone for nat20scheduling.com (must already exist and be VPC-associated)
data "aws_route53_zone" "private" {
  name         = "nat20scheduling.com."
  private_zone = true
}

# mongo.nat20scheduling.com -> current Mongo private IP (kept up to date by Terraform)
resource "aws_route53_record" "mongo_private_a" {
  zone_id         = data.aws_route53_zone.private.zone_id
  name            = "mongo"
  type            = "A"
  ttl             = 10
  records         = [data.aws_instance.mongo.private_ip]
  allow_overwrite = true
}
