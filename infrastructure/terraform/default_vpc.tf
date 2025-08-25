# replace file
resource "aws_default_vpc" "default" {
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.app_prefix}-default-vpc"
  }
}
