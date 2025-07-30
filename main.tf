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
    set -e

    # Install MongoDB 6.0 from official MongoDB repo
    tee /etc/yum.repos.d/mongodb-org-6.0.repo > /dev/null <<EOF
    [mongodb-org-6.0]
    name=MongoDB Repository
    baseurl=https://repo.mongodb.org/yum/amazon/2023/mongodb-org/6.0/x86_64/
    gpgcheck=1
    enabled=1
    gpgkey=https://pgp.mongodb.com/server-6.0.asc
    EOF

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
