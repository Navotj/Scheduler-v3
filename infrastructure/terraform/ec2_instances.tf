###############################################
# EC2 Instances (SSM-managed, no embedded secrets)
###############################################

resource "aws_instance" "mongodb" {
  ami                    = "ami-0c1b03e30bca3b373"
  instance_type          = "t3.micro"
  subnet_id              = data.aws_subnet.eu_central_1b.id
  availability_zone      = "eu-central-1b"
  vpc_security_group_ids = [aws_security_group.mongodb_access.id]
  key_name               = "terraform-ec2"
  iam_instance_profile   = aws_iam_instance_profile.ssm_ec2_profile.name

  # No secrets here; script pulls creds from SSM at runtime
  user_data = templatefile("${path.module}/mongo_install.sh.tmpl", {})

  tags = { Name = "terraform-mongodb" }

  lifecycle { create_before_destroy = true }
}

resource "aws_instance" "backend" {
  ami                    = "ami-0c1b03e30bca3b373"
  instance_type          = "t3.micro"
  subnet_id              = data.aws_subnet.eu_central_1b.id
  availability_zone      = "eu-central-1b"
  vpc_security_group_ids = [aws_security_group.backend_access.id]
  key_name               = "terraform-ec2"
  iam_instance_profile   = aws_iam_instance_profile.ssm_ec2_profile.name

  user_data = templatefile("${path.module}/backend_install.sh.tmpl", {})

  tags = { Name = "terraform-backend" }

  lifecycle { create_before_destroy = true }
}

