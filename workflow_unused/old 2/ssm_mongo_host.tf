############################################################
# SSM Parameter for Mongo Host
# - Stores logical host "mongo.<domain>" (not an IP)
# - Backend fetches this and resolves via Private Hosted Zone
############################################################

resource "aws_ssm_parameter" "mongo_host" {
  name        = "/nat20/mongo/HOST"
  description = "MongoDB hostname resolved via Route53 Private Hosted Zone"
  type        = "String"
  value       = "mongo.${var.domain_name}"
  overwrite   = true

  tags = {
    Name = "mongo-host"
  }
}
