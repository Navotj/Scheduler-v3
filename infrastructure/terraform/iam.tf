# IAM for SSM access (backend + database)

resource "aws_iam_role" "backend_role" {
  name               = "${var.app_prefix}-backend-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "ec2.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Name = "${var.app_prefix}-backend-role"
  }
}

resource "aws_iam_instance_profile" "backend_profile" {
  name = "${var.app_prefix}-backend-instance-profile"
  role = aws_iam_role.backend_role.name
}

resource "aws_iam_role_policy_attachment" "backend_ssm_core" {
  role       = aws_iam_role.backend_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role" "database_role" {
  name               = "${var.app_prefix}-database-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect    = "Allow",
      Principal = { Service = "ec2.amazonaws.com" },
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Name = "${var.app_prefix}-database-role"
  }
}

resource "aws_iam_instance_profile" "database_profile" {
  name = "${var.app_prefix}-database-instance-profile"
  role = aws_iam_role.database_role.name
}

resource "aws_iam_role_policy_attachment" "database_ssm_core" {
  role       = aws_iam_role.database_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
