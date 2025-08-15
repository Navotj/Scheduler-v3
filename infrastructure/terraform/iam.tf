###############################################
# IAM for EC2 (SSM + SSM Parameter access)
###############################################

# NOTE: data.aws_caller_identity.current is defined in data_sources.tf

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

# Base SSM access for Session Manager, inventory, etc.
resource "aws_iam_role_policy_attachment" "attach_ssm_core" {
  role       = aws_iam_role.ssm_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Allow EC2 to read SecureString SSM parameters used by app + mongo
resource "aws_iam_policy" "ssm_params_read" {
  name        = "ec2-read-ssm-params-nat20"
  description = "Allow EC2 to read SecureString params for nat20 app"
  policy      = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid     = "SSMRead",
        Effect  = "Allow",
        Action  = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParameterHistory"
        ],
        Resource = [
          "arn:aws:ssm:eu-central-1:${data.aws_caller_identity.current.account_id}:parameter/nat20/backend/JWT_SECRET",
          "arn:aws:ssm:eu-central-1:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/USER",
          "arn:aws:ssm:eu-central-1:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/PASSWORD"
        ]
      },
      {
        Sid     = "KMSDecryptForSSMDefaultKey",
        Effect  = "Allow",
        Action  = ["kms:Decrypt"],
        Resource = "*",
        Condition = {
          "ForAnyValue:StringEquals" : {
            "kms:EncryptionContext:aws:ssm:parameter-name" : [
              "/nat20/backend/JWT_SECRET",
              "/nat20/mongo/USER",
              "/nat20/mongo/PASSWORD"
            ]
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach_ssm_params_read" {
  role       = aws_iam_role.ssm_ec2_role.name
  policy_arn = aws_iam_policy.ssm_params_read.arn
}
