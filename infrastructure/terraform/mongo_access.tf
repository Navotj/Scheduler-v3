############################################################
# Allow backend -> Mongo on TCP/27017 (inside the VPC)
# Resolves the running backend instance by Name tag and opens
# Mongo's SG to it. Permanent, idempotent.
#
# Requirements:
#   - aws_instance.mongodb (the Mongo EC2 you already have)
#   - Backend instance is tagged Name=terraform-backend
############################################################

# Lookup the backend instance (by tag)
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

# Open Mongo SG to the backend SG on 27017
resource "aws_security_group_rule" "mongo_ingress_27017_from_backend" {
  type                     = "ingress"
  protocol                 = "tcp"
  from_port                = 27017
  to_port                  = 27017
  security_group_id        = aws_instance.mongodb.vpc_security_group_ids[0]
  source_security_group_id = data.aws_instance.backend.vpc_security_group_ids[0]
  description              = "Allow backend to connect to Mongo on 27017"
}
