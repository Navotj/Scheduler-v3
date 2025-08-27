########################################
# API allowlist (explicit routes only)
# Public now: /query, /auth, /health
# No proxy-wide catch-alls are defined.
########################################

# /query
resource "aws_apigatewayv2_route" "get_query" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "GET /query"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

resource "aws_apigatewayv2_route" "post_query" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "POST /query"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

# /auth (root) and /auth/*
resource "aws_apigatewayv2_route" "any_auth_root" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "ANY /auth"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

resource "aws_apigatewayv2_route" "any_auth_subpaths" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "ANY /auth/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

# /health (consider internal-only; expose here only if needed)
resource "aws_apigatewayv2_route" "get_health" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}
