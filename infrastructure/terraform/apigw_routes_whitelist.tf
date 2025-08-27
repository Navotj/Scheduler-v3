########################################
# API allowlist (explicit routes only)
# Routes derived strictly from provided code.
# No proxy-wide catch-alls are defined.
########################################

# ---------- AUTH ----------
# POST /register
resource "aws_apigatewayv2_route" "post_register" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "POST /register"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

# POST /login
resource "aws_apigatewayv2_route" "post_login" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "POST /login"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

# GET /check
resource "aws_apigatewayv2_route" "get_check" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "GET /check"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

# POST /logout
resource "aws_apigatewayv2_route" "post_logout" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "POST /logout"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

# ---------- AVAILABILITY ----------
# GET /get
resource "aws_apigatewayv2_route" "get_get" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "GET /get"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

# POST /save
resource "aws_apigatewayv2_route" "post_save" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "POST /save"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

# POST /get_many
resource "aws_apigatewayv2_route" "post_get_many" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "POST /get_many"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

# ---------- USER SETTINGS ----------
# GET /settings
resource "aws_apigatewayv2_route" "get_settings" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "GET /settings"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

# POST /settings
resource "aws_apigatewayv2_route" "post_settings" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "POST /settings"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}

# ---------- USERS ----------
# GET /exists
resource "aws_apigatewayv2_route" "get_exists" {
  api_id    = aws_apigatewayv2_api.backend_api.id
  route_key = "GET /exists"
  target    = "integrations/${aws_apigatewayv2_integration.backend_integration.id}"
}
