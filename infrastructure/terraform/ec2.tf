data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["137112412989"] # Amazon

  filter {
    name   = "name"
    values = ["al2023-ami-*-kernel-6.12-x86_64"]
  }
}

# Backend EC2
resource "aws_instance" "backend" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.ec2_instance_type
  iam_instance_profile        = aws_iam_instance_profile.backend_profile.name
  subnet_id                   = element(data.aws_subnets.default_vpc_subnets.ids, 0)
  vpc_security_group_ids      = [aws_security_group.backend.id]
  associate_public_ip_address = false

  metadata_options {
    http_tokens = "required" # IMDSv2
  }

  user_data = file("${path.module}/scripts/user_data_backend.sh")

  tags = {
    Name = "${var.app_prefix}-backend"
  }

  depends_on = [
    aws_vpc_endpoint.ssm,
    aws_vpc_endpoint.ec2messages,
    aws_vpc_endpoint.ssmmessages,
    aws_vpc_endpoint.logs,
    aws_vpc_endpoint.s3_interface
  ]
}

# Database EC2
resource "aws_instance" "database" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.ec2_instance_type
  iam_instance_profile        = aws_iam_instance_profile.database_profile.name
  subnet_id                   = element(data.aws_subnets.default_vpc_subnets.ids, 0)
  vpc_security_group_ids      = [aws_security_group.database.id]
  associate_public_ip_address = false

  metadata_options {
    http_tokens = "required" # IMDSv2
  }

  #user_data = file("${path.module}/scripts/user_data_database.sh")

  tags = {
    Name = "${var.app_prefix}-database"
  }

  depends_on = [
    aws_vpc_endpoint.ssm,
    aws_vpc_endpoint.ec2messages,
    aws_vpc_endpoint.ssmmessages,
    aws_vpc_endpoint.logs,
    aws_vpc_endpoint.s3_interface
  ]
}
# Dedicated 10 GiB gp3 volume for database data
resource "aws_ebs_volume" "database_data" {
  availability_zone = aws_instance.database.availability_zone
  size              = 10
  type              = "gp3"

  tags = {
    Name = "${var.app_prefix}-database-data"
  }
}

resource "aws_volume_attachment" "database_data_attach" {
  device_name = "/dev/xvdf"
  volume_id   = aws_ebs_volume.database_data.id
  instance_id = aws_instance.database.id
}

