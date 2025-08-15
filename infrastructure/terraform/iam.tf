###############################################
# IAM for EC2 (SSM + SSM Parameter access + S3 artifact read)
# NOTE: data.aws_caller_identity.current is defined in data_sources.tf
###############################################

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

# Allow EC2 to read ONLY the artifact objects
resource "aws_iam_policy" "s3_artifacts_read" {
  name        = "ec2-read-deploy-artifacts"
  description = "Allow EC2 to read private deploy artifacts bucket"
  policy      = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "ReadArtifacts",
        Effect = "Allow",
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ],
        Resource = [
          "${aws_s3_bucket.deploy_artifacts.arn}/*"
        ]
      },
      {
        Sid    = "ListBucketPrefix",
        Effect = "Allow",
        Action = ["s3:ListBucket"],
        Resource = aws_s3_bucket.deploy_artifacts.arn,
        Condition = {
          StringLike = {
            "s3:prefix" : [
              "backend/*"
            ]
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach_s3_artifacts_read" {
  role       = aws_iam_role.ssm_ec2_role.name
  policy_arn = aws_iam_policy.s3_artifacts_read.arn
}

# Minimal SSM Parameter Store read for backend EC2
resource "aws_iam_policy" "nat20_backend_ssm_read" {
  name        = "nat20-backend-ssm-read"
  description = "Allow backend EC2 to read required SecureString params for Mongo and JWT"
  policy      = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid:    "ReadMongoAndBackendParams",
        Effect: "Allow",
        Action: [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ],
        Resource: "*"
      }
    ]
  })
}

# If your backend instance role name differs, set this var accordingly (see variables.tf below)
resource "aws_iam_role_policy_attachment" "nat20_attach_backend_ssm_read" {
  role       = var.backend_instance_role_name
  policy_arn = aws_iam_policy.nat20_backend_ssm_read.arn
}

# Minimal SSM Parameter Store read for backend EC2 (add HOST and DB if not already present)
resource "aws_iam_policy" "nat20_backend_ssm_read_hostdb" {
  name        = "nat20-backend-ssm-read-hostdb"
  description = "Allow backend EC2 to read SecureString params for Mongo HOST/DB and JWT"
  policy      = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "ReadMongoAndBackendParams",
        Effect = "Allow",
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ],
        Resource = [
          "arn:aws:ssm:eu-central-1:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/HOST",
          "arn:aws:ssm:eu-central-1:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/DB",
          "arn:aws:ssm:eu-central-1:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/USER",
          "arn:aws:ssm:eu-central-1:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/PASSWORD",
          "arn:aws:ssm:eu-central-1:${data.aws_caller_identity.current.account_id}:parameter/nat20/backend/JWT_SECRET"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach_backend_ssm_read_hostdb" {
  role       = aws_iam_role.ssm_ec2_role.name
  policy_arn = aws_iam_policy.nat20_backend_ssm_read_hostdb.arn
}
