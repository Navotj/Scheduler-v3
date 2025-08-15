# Org-wide (single-account here) CloudTrail, multi-region, with S3 and management+data events (S3 objects in frontend bucket)
resource "aws_cloudtrail" "main" {
  name                          = "trail-${replace(var.domain_name, ".", "-")}"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  # S3 object-level Data Events for the frontend bucket
  data_resource {
    type   = "AWS::S3::Object"
    values = ["arn:aws:s3:::${aws_s3_bucket.frontend.bucket}/"]
  }

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}
