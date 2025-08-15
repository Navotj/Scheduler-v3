# SNS topic for alarms (optional subscription)
resource "aws_sns_topic" "alerts" {
  name = "alerts-${replace(var.domain_name, ".", "-")}"
}

resource "aws_sns_topic_subscription" "email" {
  count     = length(var.alarm_email) > 0 ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# CloudFront metrics live in us-east-1
resource "aws_cloudwatch_metric_alarm" "cf_5xx_rate" {
  provider            = aws.us_east_1
  alarm_name          = "CloudFront-5xxErrorRate-${replace(var.domain_name, ".", "-")}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 5
  metric_name         = "5xxErrorRate"
  namespace           = "AWS/CloudFront"
  statistic           = "Average"
  period              = 300

  dimensions = {
    DistributionId = aws_cloudfront_distribution.frontend.id
    Region         = "Global"
  }

  alarm_description = "5xx error rate > 5% over 10 minutes"
  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "cf_4xx_rate" {
  provider            = aws.us_east_1
  alarm_name          = "CloudFront-4xxErrorRate-${replace(var.domain_name, ".", "-")}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 10
  metric_name         = "4xxErrorRate"
  namespace           = "AWS/CloudFront"
  statistic           = "Average"
  period              = 300

  dimensions = {
    DistributionId = aws_cloudfront_distribution.frontend.id
    Region         = "Global"
  }

  alarm_description  = "4xx error rate > 10% over 10 minutes"
  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}
