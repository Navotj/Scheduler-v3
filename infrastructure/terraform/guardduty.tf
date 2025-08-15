###############################################
# GuardDuty (primary region + us-east-1)
###############################################

resource "aws_guardduty_detector" "primary" {
  enable = true

  datasources {
    s3_logs {
      enable = true
    }

    kubernetes {
      audit_logs {
        enable = true
      }
    }

    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes = true
      }
    }
  }
}

resource "aws_guardduty_detector" "use1" {
  provider = aws.us_east_1
  enable   = true

  datasources {
    s3_logs {
      enable = true
    }

    kubernetes {
      audit_logs {
        enable = true
      }
    }

    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes = true
      }
    }
  }
}
