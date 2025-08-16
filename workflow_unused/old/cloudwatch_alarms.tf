###############################################
# CloudWatch Alarms
# - CloudFront metrics must be created in us-east-1 (global)
###############################################

# CloudFront 5xx error rate
resource "aws_cloudwatch_metric_alarm" "cf_5xx_rate" {
  provider            = aws.us_east_1
  alarm_name          = "CloudFront-5xxErrorRate-${replace(var.domain_name, ".", "-")}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5xxErrorRate"
  namespace           = "AWS/CloudFront"
  period              = 300
  statistic           = "Average"
  threshold           = 1
  alarm_description   = "High 5xx error rate on CloudFront distribution"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DistributionId = aws_cloudfront_distribution.frontend.id
    Region         = "Global"
  }
}

# CloudFront 4xx error rate
resource "aws_cloudwatch_metric_alarm" "cf_4xx_rate" {
  provider            = aws.us_east_1
  alarm_name          = "CloudFront-4xxErrorRate-${replace(var.domain_name, ".", "-")}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "4xxErrorRate"
  namespace           = "AWS/CloudFront"
  period              = 300
  statistic           = "Average"
  threshold           = 5
  alarm_description   = "High 4xx error rate on CloudFront distribution"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DistributionId = aws_cloudfront_distribution.frontend.id
    Region         = "Global"
  }
}
