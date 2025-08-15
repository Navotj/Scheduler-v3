resource "aws_iam_role" "ssm_ec2_role" {
  name = "nat20-ec2-ssm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = { Service = "ec2.amazonaws.com" },
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_instance_profile" "ssm_ec2_profile" {
  name = "nat20-ec2-ssm-profile"
  role = aws_iam_role.ssm_ec2_role.name
}

resource "aws_iam_role_policy" "ssm_ec2_policy" {
  name = "nat20-ssm-ec2-policy"
  role = aws_iam_role.ssm_ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = [
          "ssm:DescribeParameters",
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ],
        Resource = [
          "arn:aws:ssm:eu-central-1:${data.aws_caller_identity.current.account_id}:parameter/nat20/*"
        ]
      },
      {
        Effect   = "Allow",
        Action   = [
          "kms:Decrypt"
        ],
        Resource = [
          "arn:aws:kms:eu-central-1:${data.aws_caller_identity.current.account_id}:key/*"
        ]
      }
    ]
  })
}

data "aws_caller_identity" "current" {}
