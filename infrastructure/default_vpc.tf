# replace file (create if missing)

# Manage the default VPC attributes so Private DNS works with Interface Endpoints
resource "aws_default_vpc" "default" {
  enable_dns_support   = true
  enable_dns_hostnames = true

  # Optional: force_destroy lets TF delete default VPC if ever needed (leave false by default)
  # force_destroy = false

  tags = {
    Name = "${var.app_prefix}-default-vpc"
  }
}
