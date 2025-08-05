#############
# Variables #
#############

variable "ADMIN_MONGO_USER" {
  type = string
}

variable "admin_mongo_password" {
  type      = string
  sensitive = true
}

variable "s3_mongo_user" {
  type = string
}

variable "s3_mongo_password" {
  type      = string
  sensitive = true
}

############
# Settings #
############

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
}

###########
# Network #
###########

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

resource "aws_security_group" "backend_access" {
  name        = "backend-access"
  description = "Allow MongoDB access"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 3000
    to_port     = 3000
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
    Name = "backend-access"
  }
}



#################
# EC2 Instances #
#################

# MongoDB Instance
resource "aws_instance" "mongodb" {
  ami                         = "ami-0c1b03e30bca3b373"
  instance_type               = "t3.micro"
  subnet_id                   = data.aws_subnet.eu_central_1b.id
  availability_zone           = "eu-central-1b"
  vpc_security_group_ids      = [aws_security_group.mongodb_access.id]
  key_name = "terraform-ec2"

  user_data = templatefile("${path.module}/mongo_install.sh.tmpl", {
    admin_mongo_user        = var.ADMIN_MONGO_USER
    admin_mongo_password    = var.admin_mongo_password
    s3_mongo_user           = var.s3_mongo_user
    s3_mongo_password       = var.s3_mongo_password
  })

  tags = {
    Name = "terraform-mongodb"
  }
}

# Python/Node.js Instance
resource "aws_instance" "backend" {
  ami                         = "ami-0c1b03e30bca3b373"
  instance_type               = "t3.micro"
  subnet_id                   = data.aws_subnet.eu_central_1b.id
  availability_zone           = "eu-central-1b"
  vpc_security_group_ids      = [aws_security_group.backend_access.id]
  key_name = "terraform-ec2"

  user_data = templatefile("${path.module}/backend_install.sh.tmpl", {})


  tags = {
    Name = "terraform-backend"
  }
}

######################
# Persistent Storage #
######################

# MongoDB Storage Volume
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

# MongoDB Storage Attachment
resource "aws_volume_attachment" "mongo_data_attachment" {
  device_name = "/dev/xvdf"
  volume_id   = aws_ebs_volume.mongo_data.id
  instance_id = aws_instance.mongodb.id
  force_detach = true
}

##############
# S3 Buckets #
##############

resource "aws_s3_bucket" "frontend" {
  bucket         = "navot-scheduler-frontend-2025"
  force_destroy  = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  ignore_public_acls      = false
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

output "frontend_bucket_name" {
  description = "Name of the frontend S3 bucket"
  value       = aws_s3_bucket.frontend.bucket
}

output "s3_website_url" {
  description = "Static website URL"
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
}
