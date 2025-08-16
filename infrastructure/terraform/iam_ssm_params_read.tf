# IAM policy attached to your EC2 role nat20-ec2-ssm-role
resource "aws_iam_policy" "ssm_params_read" {
  name        = "ec2-read-ssm-params-nat20"
  description = "Allow EC2 to read and decrypt required SSM parameters for NAT20"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadMongoAndBackendParams"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = [
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/nat20/backend/JWT_SECRET",
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/USER",
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/PASSWORD",
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/HOST",
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/DB"
        ]
      },
      {
        Sid    = "KMSDecryptForSSMDefaultKey"
        Effect = "Allow"
        Action = ["kms:Decrypt"]
        Resource = "*"
        Condition = {
          "ForAnyValue:StringEquals" = {
            "kms:EncryptionContext:aws:ssm:parameter-name" = [
              "/nat20/backend/JWT_SECRET",
              "/nat20/mongo/USER",
              "/nat20/mongo/PASSWORD",
              "/nat20/mongo/HOST",
              "/nat20/mongo/DB"
            ]
          }
        }
      }
    ]
  })
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
