############################################################
# Session Manager logging: CloudWatch Logs + S3
# - Logs go to CW log group: /nat20/ssm/sessions
# - Copies also saved to your existing logs bucket under s3://<logs-bucket>/ssm/
# - Minimal extra IAM so instances can write the logs.
############################################################

# CloudWatch log group for session transcripts
resource "aws_cloudwatch_log_group" "ssm_sessions" {
  name              = "/nat20/ssm/sessions"
  retention_in_days = 30
}

# Give the EC2 instance role permission to write logs + S3 objects
resource "aws_iam_policy" "ssm_session_logging" {
  name        = "ec2-ssm-session-logging"
  description = "Allow SSM session transcripts to CW Logs and S3"
  policy      = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "WriteCloudWatchLogs",
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents"
        ],
        Resource = [
          "${aws_cloudwatch_log_group.ssm_sessions.arn}",
          "${aws_cloudwatch_log_group.ssm_sessions.arn}:*"
        ]
      },
      {
        Sid    = "WriteS3Transcripts",
        Effect = "Allow",
        Action = [
          "s3:PutObject",
          "s3:AbortMultipartUpload",
          "s3:ListBucketMultipartUploads"
        ],
        Resource = [
          aws_s3_bucket.logs.arn,
          "${aws_s3_bucket.logs.arn}/ssm/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "attach_ssm_session_logging" {
  role       = aws_iam_role.ssm_ec2_role.name
  policy_arn = aws_iam_policy.ssm_session_logging.arn
}

# Session Manager account preferences (enables logging)
# This special document name is how AWS stores Session Manager prefs in your account.
resource "aws_ssm_document" "session_manager_prefs" {
  name          = "SSM-SessionManagerRunShell"
  document_type = "Session"
  document_format = "JSON"
  content = jsonencode({
    schemaVersion = "1.0",
    description   = "Session Manager preferences for logging",
    sessionType   = "Standard_Stream",
    inputs = {
      # CloudWatch Logs
      cloudWatchLogGroupName      = aws_cloudwatch_log_group.ssm_sessions.name
      cloudWatchEncryptionEnabled = false

      # S3 copy
      s3BucketName        = aws_s3_bucket.logs.bucket
      s3KeyPrefix         = "ssm/"
      s3EncryptionEnabled = false

      # Optional idle timeout (minutes). Set as you like or remove.
      idleSessionTimeout = "60"

      # Don’t switch user; run as the default OS user
      runAsEnabled = false
    }
  })
}
