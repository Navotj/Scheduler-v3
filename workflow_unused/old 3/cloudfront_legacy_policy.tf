############################################################
# LEGACY CloudFront Origin Request Policy (kept to avoid 409)
# Not used by the distribution anymore — retained to let CF
# finish disassociating before manual cleanup.
############################################################
resource "aws_cloudfront_origin_request_policy" "api_all_cookies" {
  name = "api-all-cookies-all-qs-no-host"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "Accept",
        "Accept-Language",
        "Content-Type",
        "Origin",
        "Referer",
        "User-Agent",
        "Access-Control-Request-Headers",
        "Access-Control-Request-Method"
      ]
    }
  }

  query_strings_config {
    query_string_behavior = "all"
  }

  lifecycle {
    prevent_destroy = true
  }
}
