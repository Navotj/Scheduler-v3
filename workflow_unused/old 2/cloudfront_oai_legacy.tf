############################################################
# LEGACY OAI (kept during OAC migration to prevent downtime)
# Do not reference this OAI from the distribution anymore.
# We keep it ONLY so Terraform won't try to delete it
# while CloudFront might still have a stale association.
############################################################

resource "aws_cloudfront_origin_access_identity" "frontend" {
  comment = "LEGACY: kept to avoid downtime while migrating to OAC"
  lifecycle {
    prevent_destroy = true
  }
}
