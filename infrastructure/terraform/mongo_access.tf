###############################################
# Allow backend -> Mongo on TCP/27017 (VPC-internal)
###############################################

# Security group rule on the Mongo instance's SG to allow traffic
resource "aws_security_group_rule" "mongo_ingress_27017_from_backend" {
  type                     = "ingress"
  protocol                 = "tcp"
  from_port                = 27017
  to_port                  = 27017
  security_group_id        = element(data.aws_instance.mongo.vpc_security_group_ids, 0)
  source_security_group_id = element(data.aws_instance.backend.vpc_security_group_ids, 0)
  description              = "Allow backend to connect to Mongo on 27017"
}
