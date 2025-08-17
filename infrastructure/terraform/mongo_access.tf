############################################################
# Allow backend -> Mongo on TCP/27017 (inside the VPC)
# - Looks up backend instance by Name tag
# - Opens Mongo's SG to backend SG on 27017
############################################################

# Lookup the backend instance (by Name tag)
data "aws_instances" "backend" {
  instance_tags = { Name = "terraform-backend" }
  filter {
    name   = "instance-state-name"
    values = ["pending", "running", "stopped", "stopping"]
  }
}

data "aws_instance" "backend" {
  instance_id = data.aws_instances.backend.ids[0]
}

# Allow ingress from backend SG to Mongo SG on 27017
resource "aws_security_group_rule" "mongo_ingress_27017_from_backend" {
  type                     = "ingress"
  protocol                 = "tcp"
  from_port                = 27017
  to_port                  = 27017
  security_group_id        = aws_instance.mongodb.vpc_security_group_ids[0]
  source_security_group_id = data.aws_instance.backend.vpc_security_group_ids[0]
  description              = "Allow backend to connect to Mongo on 27017"
}
