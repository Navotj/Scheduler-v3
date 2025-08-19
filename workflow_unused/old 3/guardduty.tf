############################################################
# Amazon GuardDuty (primary region + us-east-1)
############################################################

resource "aws_guardduty_detector" "primary" {
  enable = true
}

resource "aws_guardduty_detector_feature" "primary_s3_data_events" {
  detector_id = aws_guardduty_detector.primary.id
  name        = "S3_DATA_EVENTS"
  status      = "ENABLED"
}

resource "aws_guardduty_detector_feature" "primary_ebs_malware" {
  detector_id = aws_guardduty_detector.primary.id
  name        = "EBS_MALWARE_PROTECTION"
  status      = "ENABLED"
}

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
