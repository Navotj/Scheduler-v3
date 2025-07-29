variable "mongodb_user" {
  type = string
}

variable "mongodb_password" {
  type      = string
  sensitive = true
}

provider "aws" {
  region = "eu-central-1"
}

data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "mongodb_access" {
  name        = "mongodb-access"
  description = "Allow MongoDB access"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "MongoDB from anywhere (TEMPORARY for testing)"
    from_port   = 27017
    to_port     = 27017
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # ⚠️ Replace with your IP in production
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "mongodb-access"
  }
}

resource "aws_instance" "mongodb" {
  ami                    = "ami-0c1b03e30bca3b373" # Amazon Linux 2023 x86_64 in eu-central-1
  instance_type          = "t3.micro"
  vpc_security_group_ids = [aws_security_group.mongodb_access.id]

  user_data = <<-EOM
    #!/bin/bash
    yum update -y
    amazon-linux-extras enable mongodb4.0
    yum install -y mongodb-org

    sed -i 's/^  bindIp:.*$/  bindIp: 0.0.0.0/' /etc/mongod.conf
    echo -e "\\nsecurity:\\n  authorization: enabled" >> /etc/mongod.conf

    systemctl start mongod
    systemctl enable mongod

    sleep 10

    mongo admin --eval 'db.createUser({user:"${var.mongodb_user}",pwd:"${var.mongodb_password}",roles:[{role:"root",db:"admin"}]})'

    systemctl restart mongod
  EOM

  tags = {
    Name = "terraform-mongodb"
  }
}
