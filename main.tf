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

terraform {
  backend "s3" {
    bucket         = "navot-terraform-state-1"
    key            = "mongodb/terraform.tfstate"
    region         = "eu-central-1"
    dynamodb_table = "terraform-lock-table"
    encrypt        = true
  }
}

resource "aws_security_group" "mongodb_access" {
  name        = "mongodb-access"
  description = "Allow MongoDB access"
  vpc_id      = data.aws_vpc.default.id

ingress {
    from_port = 22
    to_port   = 22
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port = 27017
    to_port   = 27017
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port = 0
    to_port = 0
    protocol = "-1"
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
    user_data = <<EOF
    #!/bin/bash
    apt-get update
    apt-get install -y gnupg curl
    curl -fsSL https://pgp.mongodb.com/server-8.0.asc | \
    gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg \
    --dearmor
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt-get update
    apt-get install -y mongodb-org
    systemctl start mongod
    systemctl enable mongodb
    sleep 10
    mongo admin --eval 'db.createUser({user="${var.mongodb_user}",pwd="${var.mongodb_password}",roles:[{role:"root",db:"admin"}]})'
EOF
  tags = {
    Name = "terraform-mongodb"
  }
}
