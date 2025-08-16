###############################################
# CloudTrail (management events to dedicated bucket)
###############################################

resource "aws_cloudtrail" "main" {
  name                          = "trail-${replace(var.domain_name, ".", "-")}"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.bucket
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_logging                = true

  event_selector {
    read_write_type           = "All"
    include_management_events = true
    # No data_resource here; management events only.
  }

  depends_on = [
    aws_s3_bucket.cloudtrail,
    aws_s3_bucket_policy.cloudtrail
  ]
}
