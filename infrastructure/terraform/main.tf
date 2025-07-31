#############
# Variables #
#############

variable "mongodb_user" {
  type = string
}

variable "mongodb_password" {
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

resource "aws_security_group" "full_access" {
  name        = "full-access"
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
    Name = "full-access"
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
  vpc_security_group_ids      = [aws_security_group.full_access.id]
  key_name = "terraform-ec2"

  user_data = templatefile("${path.module}/mongo_install.sh.tmpl", {
    mongodb_user     = var.mongodb_user
    mongodb_password = var.mongodb_password
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
  vpc_security_group_ids      = [aws_security_group.full_access.id]
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

resource "random_id" "rand" {
  byte_length = 4
}

resource "aws_s3_bucket" "scheduler-frontend" {
  bucket = "scheduler-frontend-${random_id.rand.hex}"
  acl    = "public-read"

  website {
    index_document = "index.html"
    error_document = "index.html"
  }

  tags = {
    Name = "Frontend S3"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend_block" {
  bucket = aws_s3_bucket.scheduler-frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend_policy" {
  bucket = aws_s3_bucket.scheduler-frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.scheduler-frontend.arn}/*"
    }]
  })
}

output "scheduler-frontend_name" {
  value       = aws_s3_bucket.scheduler-frontend.bucket
  description = "Bucket name for the frontend"
}

output "s3_website_url" {
  value       = aws_s3_bucket.scheduler-frontend.website_endpoint
  description = "URL to access the static website"
}
