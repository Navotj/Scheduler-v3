########################################
# Lambda REQUEST authorizer for HTTP API
# - Validates X-Edge-Secret header set by CloudFront origin config
########################################

locals {
  edge_auth_name = "${var.app_prefix}-edge-header-authorizer"
}

data "aws_caller_identity" "current" {}

# Execution role for the authorizer Lambda
resource "aws_iam_role" "edge_auth_lambda_role" {
  name               = "${var.app_prefix}-edge-auth-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = { Service = "lambda.amazonaws.com" },
      Action   = "sts:AssumeRole"
    }]
  })
  tags = { Name = "${var.app_prefix}-edge-auth-lambda-role" }
}

resource "aws_iam_role_policy_attachment" "edge_auth_lambda_basic" {
  role       = aws_iam_role.edge_auth_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Package authorizer code
data "archive_file" "edge_authorizer_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda/edge_authorizer.js"
  output_path = "${path.module}/lambda/edge_authorizer.zip"
}

resource "aws_cloudwatch_log_group" "edge_authorizer_logs" {
  name              = "/aws/lambda/${local.edge_auth_name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "edge_header_auth" {
  function_name    = local.edge_auth_name
  role             = aws_iam_role.edge_auth_lambda_role.arn
  filename         = data.archive_file.edge_authorizer_zip.output_path
  source_code_hash = data.archive_file.edge_authorizer_zip.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 5

  environment {
    variables = {
      EDGE_SECRET = var.edge_secret
    }
  }

  depends_on = [aws_cloudwatch_log_group.edge_authorizer_logs]
  tags       = { Name = local.edge_auth_name }
}

# Allow API Gateway (HTTP API) to invoke the authorizer Lambda
resource "aws_lambda_permission" "allow_apigw_invoke_authorizer" {
  statement_id    = "AllowInvokeByApiGatewayAuthorizer"
  action          = "lambda:InvokeFunction"
  function_name   = aws_lambda_function.edge_header_auth.arn
  principal       = "apigateway.amazonaws.com"
  source_account  = data.aws_caller_identity.current.account_id
}

# HTTP API Lambda authorizer (REQUEST, simple response v2.0)
resource "aws_apigatewayv2_authorizer" "edge_header" {
  api_id                            = aws_apigatewayv2_api.backend_api.id
  name                              = local.edge_auth_name
  authorizer_type                   = "REQUEST"
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
  identity_sources                  = ["route.request.header.X-Edge-Secret"]
  authorizer_uri                    = "arn:aws:apigateway:${data.aws_region.current.id}:lambda:path/2015-03-31/functions/${aws_lambda_function.edge_header_auth.arn}/invocations"

  depends_on = [aws_lambda_permission.allow_apigw_invoke_authorizer]
}
