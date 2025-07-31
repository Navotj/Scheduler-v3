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

terraform {
  backend "s3" {
    bucket         = "navot-terraform-state-1"
    key            = "mongodb/terraform.tfstate"
    region         = "eu-central-1"
    dynamodb_table = "terraform-lock-table"
    encrypt        = true
  }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "eu_central_1b" {
  filter {
    name   = "availability-zone"
    values = ["eu-central-1b"]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }

  # Optional: filter by VPC to ensure correct subnet
  # filter {
  #   name   = "vpc-id"
  #   values = [data.aws_vpc.default.id]
  # }
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
  ami                         = "ami-0c1b03e30bca3b373"
  instance_type               = "t3.micro"
  subnet_id                   = data.aws_subnet.eu_central_1b.id
  availability_zone           = "eu-central-1b"
  vpc_security_group_ids      = [aws_security_group.mongodb_access.id]

  user_data = templatefile("${path.module}/mongo_install.sh.tmpl", {
    mongodb_user     = var.mongodb_user
    mongodb_password = var.mongodb_password
  })

  tags = {
    Name = "terraform-mongodb"
  }
}

resource "aws_ebs_volume" "mongo_data" {
  availability_zone = "eu-central-1b"
  size              = 20
  type              = "gp3"

  tags = {
    Name = "MongoDBDataVolume"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "mongo_data_attachment" {
  device_name = "/dev/xvdf"
  volume_id   = aws_ebs_volume.mongo_data.id
  instance_id = aws_instance.mongodb.id
  force_detach = true
}

resource "aws_instance" "backend" {
  ami                         = "ami-0c1b03e30bca3b373"
  instance_type               = "t3.micro"
  subnet_id                   = data.aws_subnet.eu_central_1b.id
  availability_zone           = "eu-central-1b"
  vpc_security_group_ids      = [aws_security_group.mongodb_access.id]

  user_data = templatefile("${path.module}/backend_install.sh.tmpl")

  tags = {
    Name = "terraform-backend"
  }
}
