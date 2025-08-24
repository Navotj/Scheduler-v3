data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["137112412989"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-kernel-6.12-x86_64"]
  }
}

resource "aws_instance" "backend" {
  ami           = data.aws_ami.al2023.id
  instance_type = var.ec2_instance_type

  tags = {
    Name = "backend"
  }
}
