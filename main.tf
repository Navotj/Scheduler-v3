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

  user_data = templatefile("${path.module}/mongo_install.sh.tmpl", {
    mongodb_user     = var.mongodb_user
    mongodb_password = var.mongodb_password
  })

  tags = {
    Name = "terraform-mongodb"
  }
}

