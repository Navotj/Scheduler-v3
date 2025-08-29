########################################
# Lambda REQUEST authorizer for HTTP API
# - Validates X-Origin-Verify header set by CloudFront origin config
########################################

locals {
  authorizer_name = "${var.app_prefix}-origin-verify-authorizer"
}

# Reuse existing data sources declared elsewhere in the module:
# - data.aws_region.current
# - data.aws_caller_identity.current

resource "aws_iam_role" "origin_auth_lambda_role" {
  name               = "${var.app_prefix}-origin-auth-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = { Service = "lambda.amazonaws.com" },
      Action   = "sts:AssumeRole"
    }]
  })
  tags = { Name = "${var.app_prefix}-origin-auth-lambda-role" }
}

resource "aws_iam_role_policy_attachment" "origin_auth_lambda_basic" {
  role       = aws_iam_role.origin_auth_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "archive_file" "origin_authorizer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/origin_authorizer.js"
  output_path = "${path.module}/lambda/origin_authorizer.zip"
}

resource "aws_cloudwatch_log_group" "origin_authorizer_logs" {
  name              = "/aws/lambda/${local.authorizer_name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "origin_verify_auth" {
  function_name    = local.authorizer_name
  role             = aws_iam_role.origin_auth_lambda_role.arn
  filename         = data.archive_file.origin_authorizer_zip.output_path
  source_code_hash = data.archive_file.origin_authorizer_zip.output_base64sha256

  # index.js exports exports.handler = async (...)
  handler = "index.handler"
  runtime = "nodejs20.x"
  timeout = 5

  environment {
    variables = {
      ORIGIN_VERIFY_SECRET = var.origin_verify_secret
    }
  }

  depends_on = [aws_cloudwatch_log_group.origin_authorizer_logs]
  tags       = { Name = local.authorizer_name }
}

resource "aws_lambda_permission" "allow_apigw_invoke_authorizer" {
  statement_id   = "AllowInvokeByApiGatewayAuthorizer"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.origin_verify_auth.arn
  principal      = "apigateway.amazonaws.com"
  source_account = data.aws_caller_identity.current.account_id
}

# HTTP API Lambda authorizer (REQUEST, simple responses)
resource "aws_apigatewayv2_authorizer" "origin_verify" {
  api_id                            = aws_apigatewayv2_api.backend_api.id
  name                              = local.authorizer_name
  authorizer_type                   = "REQUEST"
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true

  # HTTP API syntax: $request.header.<Header-Name>
  identity_sources = ["$request.header.X-Origin-Verify"]

  # Use region.id (name is deprecated in provider v6)
  authorizer_uri = "arn:aws:apigateway:${data.aws_region.current.id}:lambda:path/2015-03-31/functions/${aws_lambda_function.origin_verify_auth.arn}/invocations"

  depends_on = [aws_lambda_permission.allow_apigw_invoke_authorizer]
}
