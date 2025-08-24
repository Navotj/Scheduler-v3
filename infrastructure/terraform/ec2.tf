data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["137112412989"] # Amazon

  filter {
    name   = "name"
    values = ["al2023-ami-*-kernel-6.12-x86_64"]
  }
}

# Backend EC2 + 1 GiB gp3 volume mounted at /opt/app
resource "aws_instance" "backend" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.ec2_instance_type
  iam_instance_profile   = aws_iam_instance_profile.backend_profile.name
  vpc_security_group_ids = [aws_security_group.backend.id]

  metadata_options {
    http_tokens = "required" # IMDSv2
  }

  user_data = file("${path.module}/scripts/user_data_backend.sh")

  tags = {
    Name = "backend"
  }
}

# Dedicated 1 GiB gp3 volume for /opt/app in the same AZ as the backend
resource "aws_ebs_volume" "backend_app" {
  availability_zone = aws_instance.backend.availability_zone
  size              = 1
  type              = "gp3"

  tags = {
    Name = "${var.app_prefix}-backend-appdata"
  }
}

resource "aws_volume_attachment" "backend_app_attach" {
  device_name = "/dev/xvdf"
  volume_id   = aws_ebs_volume.backend_app.id
  instance_id = aws_instance.backend.id
}

# Database EC2
resource "aws_instance" "database" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.ec2_instance_type
  vpc_security_group_ids = [aws_security_group.database.id]

  tags = {
    Name = "database"
  }
}
