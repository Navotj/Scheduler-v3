data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["137112412989"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-kernel-6.12-x86_64"]
  }
}

resource "aws_instance" "backend" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.ec2_instance_type
  iam_instance_profile        = aws_iam_instance_profile.backend_profile.name
  subnet_id                   = aws_subnet.private_a.id
  vpc_security_group_ids      = [aws_security_group.backend_ingress.id, aws_security_group.backend_egress.id]
  associate_public_ip_address = false

  metadata_options {
    http_tokens = "required"
  }

  user_data = templatefile("${path.module}/scripts/user_data_envwrap.tpl", {
    database_user            = var.database_user
    database_password        = var.database_password
    database_name            = "appdb"
    database_host            = aws_instance.database.private_ip
    script                   = file("${path.module}/scripts/user_data_backend.sh")
  })

  tags = { Name = "${var.app_prefix}-backend" }
}

resource "aws_instance" "database" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.ec2_instance_type
  iam_instance_profile        = aws_iam_instance_profile.database_profile.name
  subnet_id                   = aws_subnet.private_a.id
  vpc_security_group_ids      = [aws_security_group.database_ingress.id, aws_security_group.database_egress.id]
  associate_public_ip_address = false
  user_data_replace_on_change = true

  metadata_options {
    http_tokens = "required"
  }

  user_data = templatefile("${path.module}/scripts/user_data_envwrap.tpl", {
    database_user            = var.database_user
    database_password        = var.database_password
    database_name            = "appdb"
    script                   = file("${path.module}/scripts/user_data_database.sh")
  })

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 6
    delete_on_termination = true
  }

  tags = { Name = "${var.app_prefix}-database" }
}

resource "aws_ebs_volume" "database_data" {
  availability_zone = aws_subnet.private_a.availability_zone
  size              = 10
  type              = "gp3"
  encrypted         = true
  tags = { Name = "${var.app_prefix}-database-data" }
  lifecycle { prevent_destroy = true }
}

resource "aws_volume_attachment" "database_data_attach" {
  device_name = "/dev/xvdf"
  volume_id   = aws_ebs_volume.database_data.id
  instance_id = aws_instance.database.id
}
