###############################################
# Amazon GuardDuty (per-account, multi-Region)
# Using aws_guardduty_detector_feature (no deprecation)
###############################################

# Primary region detector
resource "aws_guardduty_detector" "primary" {
  enable = true
}

# Enable S3 data event monitoring
resource "aws_guardduty_detector_feature" "primary_s3_data_events" {
  detector_id = aws_guardduty_detector.primary.id
  name        = "S3_DATA_EVENTS"
  status      = "ENABLED"
}

# Enable EC2/EBS Malware Protection
resource "aws_guardduty_detector_feature" "primary_ebs_malware" {
  detector_id = aws_guardduty_detector.primary.id
  name        = "EBS_MALWARE_PROTECTION"
  status      = "ENABLED"
}

# (Optional) Enable EKS Audit Logs if you use EKS
# resource "aws_guardduty_detector_feature" "primary_eks_audit" {
#   detector_id = aws_guardduty_detector.primary.id
#   name        = "EKS_AUDIT_LOGS"
#   status      = "ENABLED"
# }

# (Optional) Enable Lambda network logs if you use Lambda at scale
# resource "aws_guardduty_detector_feature" "primary_lambda_net" {
#   detector_id = aws_guardduty_detector.primary.id
#   name        = "LAMBDA_NETWORK_LOGS"
#   status      = "ENABLED"
# }

################################################
# us-east-1 detector (keep parity across regions)
################################################
resource "aws_guardduty_detector" "use1" {
  provider = aws.us_east_1
  enable   = true
}

resource "aws_guardduty_detector_feature" "use1_s3_data_events" {
  provider    = aws.us_east_1
  detector_id = aws_guardduty_detector.use1.id
  name        = "S3_DATA_EVENTS"
  status      = "ENABLED"
}

resource "aws_guardduty_detector_feature" "use1_ebs_malware" {
  provider    = aws.us_east_1
  detector_id = aws_guardduty_detector.use1.id
  name        = "EBS_MALWARE_PROTECTION"
  status      = "ENABLED"
}

# (Optional) EKS in us-east-1
# resource "aws_guardduty_detector_feature" "use1_eks_audit" {
#   provider    = aws.us_east_1
#   detector_id = aws_guardduty_detector.use1.id
#   name        = "EKS_AUDIT_LOGS"
#   status      = "ENABLED"
# }

# (Optional) Lambda network logs in us-east-1
# resource "aws_guardduty_detector_feature" "use1_lambda_net" {
#   provider    = aws.us_east_1
#   detector_id = aws_guardduty_detector.use1.id
#   name        = "LAMBDA_NETWORK_LOGS"
#   status      = "ENABLED"
# }
