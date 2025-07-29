provider "aws" {
  region = "eu-central-1"
}

resource "aws_instance" "mongodb" {
  ami           = "ami-0c1b03e30bca3b373" # Amazon Linux 2 in eu-central-1
  instance_type = "t3.micro"

  user_data = <<-EOF
    #!/bin/bash
    yum update -y
    amazon-linux-extras enable mongodb4.0
    yum install -y mongodb-org
    systemctl start mongod
    systemctl enable mongod
  EOF

  tags = {
    Name = "terraform-mongodb"
  }
}
