############################################
# EC2 role & attachments for SSM + artifacts
############################################

resource "aws_iam_role" "ssm_ec2_role" {
  name = "nat20-ec2-ssm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid     = "EC2AssumeRole",
        Effect  = "Allow",
        Action  = "sts:AssumeRole",
        Principal = { Service = "ec2.amazonaws.com" }
      }
    ]
  })

  tags = { Name = "nat20-ec2-ssm-role" }
}

resource "aws_iam_instance_profile" "ssm_ec2_profile" {
  name = "nat20-ec2-ssm-profile"
  role = aws_iam_role.ssm_ec2_role.name
}

resource "aws_iam_role_policy_attachment" "attach_ssm_core" {
  role       = aws_iam_role.ssm_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Artifacts bucket read/delete
data "aws_iam_policy_document" "s3_artifacts_read" {
  statement {
    sid     = "ListAndLocateArtifactsBucket"
    effect  = "Allow"
    actions = ["s3:ListBucket","s3:GetBucketLocation"]
    resources = [aws_s3_bucket.deploy_artifacts.arn]
  }

  statement {
    sid     = "ReadAndDeleteArtifactsObjects"
    effect  = "Allow"
    actions = [
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucketMultipartUploads",
      "s3:AbortMultipartUpload"
    ]
    resources = ["${aws_s3_bucket.deploy_artifacts.arn}/*"]
  }
}

resource "aws_iam_policy" "s3_artifacts_read" {
  name   = "ec2-read-deploy-artifacts"
  path   = "/"
  policy = data.aws_iam_policy_document.s3_artifacts_read.json
}

resource "aws_iam_role_policy_attachment" "attach_s3_artifacts_read" {
  role       = aws_iam_role.ssm_ec2_role.name
  policy_arn = aws_iam_policy.s3_artifacts_read.arn
}

# SSM Parameters read policy (document is in iam_ssm_params_read.tf)
resource "aws_iam_policy" "ssm_params_read" {
  name   = "ec2-read-ssm-params-nat20"
  path   = "/"
  policy = data.aws_iam_policy_document.ssm_params_read.json
}

resource "aws_iam_role_policy_attachment" "attach_ssm_params_read" {
  role       = aws_iam_role.ssm_ec2_role.name
  policy_arn = aws_iam_policy.ssm_params_read.arn
}
