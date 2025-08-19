# Keep the legacy OAC so CloudFront doesn't 409 during the same apply.
# Safe to leave around; remove this file later in a separate apply if you want.

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "frontend-oac"
  description                       = "OAC for CloudFront to access S3 frontend bucket (legacy)"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"

  lifecycle {
    prevent_destroy = true
  }
}
