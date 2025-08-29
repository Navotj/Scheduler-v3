########################################
# API Gateway HTTP API + VPC Link -> NLB
########################################

resource "aws_apigatewayv2_api" "backend_api" {
  name          = "${var.app_prefix}-httpapi"
  protocol_type = "HTTP"

  # Prevent use of the default execute-api endpoint; callers must use your custom domain (or CloudFront).
  disable_execute_api_endpoint = true

  cors_configuration {
    allow_credentials = true
    allow_headers     = ["Content-Type", "X-Requested-With", "Authorization", "Cookie"]
    allow_methods     = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]
    allow_origins     = ["https://${local.frontend_hostname}", "https://www.${var.root_domain}"]
    max_age           = 600
  }
}

resource "aws_apigatewayv2_vpc_link" "backend_link" {
  name               = "${var.app_prefix}-vpc-link"
  subnet_ids         = [aws_subnet.private_a.id]
  security_group_ids = [aws_security_group.apigw_vpc_link.id]
  tags               = { Name = "${var.app_prefix}-vpc-link" }
}

resource "aws_apigatewayv2_integration" "backend_integration" {
  api_id                 = aws_apigatewayv2_api.backend_api.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.backend_link.id
  integration_uri        = aws_lb_listener.backend_nlb_3000.arn
  payload_format_version = "1.0"
  timeout_milliseconds   = 29000
}

# Route all requests to the backend via the VPC Link/NLB
# Require the Lambda authorizer that checks X-Origin-Verify
resource "aws_apigatewayv2_route" "default" {
  api_id             = aws_apigatewayv2_api.backend_api.id
  route_key          = "$default"
  target             = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.origin_verify.id
}

resource "aws_cloudwatch_log_group" "apigw_logs" {
  name              = "/aws/apigw/${var.app_prefix}-httpapi"
  retention_in_days = 14
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.backend_api.id
  name        = "prod"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw_logs.arn
    format          = jsonencode({
      requestId  = "$context.requestId",
      httpMethod = "$context.httpMethod",
      path       = "$context.path",
      status     = "$context.status",
      ip         = "$context.identity.sourceIp"
    })
  }
}
