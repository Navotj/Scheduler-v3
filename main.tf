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
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 27017
    to_port     = 27017
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
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

  user_data = <<-EOF
    #!/bin/bash
    set -e

    # Update OS
    yum update -y

    # Install prerequisites
    yum install -y gnupg2 curl

    # Import MongoDB public GPG key
    curl -fsSL https://pgp.mongodb.com/server-8.0.asc | \
    gpg --dearmor -o /etc/pki/rpm-gpg/mongodb-org-8.0.gpg

    # Create MongoDB repo file
    cat <<REPO > /etc/yum.repos.d/mongodb-org-8.0.repo
    [mongodb-org-8.0]
    name=MongoDB Repository
    baseurl=https://repo.mongodb.org/yum/amazon/2023/mongodb-org/8.0/x86_64/
    gpgcheck=1
    enabled=1
    gpgkey=file:///etc/pki/rpm-gpg/mongodb-org-8.0.gpg
    REPO

    # Install MongoDB
    yum install -y mongodb-org

    # Enable and start MongoDB service
    systemctl enable mongod
    systemctl start mongod

    # Wait for MongoDB to start
    sleep 10

    # Create admin user
    mongo admin --eval "db.createUser({ user: '${var.mongodb_user}', pwd: '${var.mongodb_password}', roles:[{role:'root',db:'admin'}] });"
EOF

  tags = {
    Name = "terraform-mongodb"
  }
}

