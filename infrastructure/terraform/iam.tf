# IAM for EC2 instances to use SSM. Minimal and private-subnet friendly.

resource "aws_iam_role" "ec2_ssm_role" {
  name_prefix = "${var.app_prefix}-ec2-ssm-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = { Service = "ec2.amazonaws.com" },
      Action = "sts:AssumeRole"
    }]
  })
  tags = {
    Name = "${var.app_prefix}-ec2-ssm-role"
  }
}

# Attach only what is needed for SSM connectivity.
resource "aws_iam_role_policy_attachment" "ec2_ssm_core" {
  role       = aws_iam_role.ec2_ssm_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Separate instance profiles for clarity. Both use the same role.
resource "aws_iam_instance_profile" "backend_profile" {
  name_prefix = "${var.app_prefix}-backend-"
  role        = aws_iam_role.ec2_ssm_role.name
}

resource "aws_iam_instance_profile" "database_profile" {
  name_prefix = "${var.app_prefix}-database-"
  role        = aws_iam_role.ec2_ssm_role.name
}

resource "aws_iam_role_policy" "backend_artifacts_read" {
  name = "${var.app_prefix}-backend-artifacts-read"
  role = aws_iam_role.backend_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid: "ListArtifactsPrefix",
        Effect: "Allow",
        Action: ["s3:ListBucket"],
        Resource: "arn:aws:s3:::${var.app_prefix}-artifacts",
        Condition: {
          StringLike: {
            "s3:prefix": [
              "releases/*",
              "releases/"s
            ]
          }
        }
      },
      {
        Sid: "GetArtifactsObjects",
        Effect: "Allow",
        Action: ["s3:GetObject"],
        Resource: "arn:aws:s3:::${var.app_prefix}-artifacts/*"
      }
    ]
  })
}
