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
