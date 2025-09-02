########################################
# API allowlist (explicit routes only)
# Derived strictly from backend code.
# No proxy-wide catch-alls are defined.
########################################

# Convenience locals
locals {
  int_id = aws_apigatewayv2_integration.backend_integration.id
  api_id = aws_apigatewayv2_api.backend_api.id
  authz  = aws_apigatewayv2_authorizer.origin_verify.id
}

# ---------- AUTH (mounted at /auth) ----------
# GET /auth/check
resource "aws_apigatewayv2_route" "get_auth_check" {
  api_id             = local.api_id
  route_key          = "GET /auth/check"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# POST /auth/logout
resource "aws_apigatewayv2_route" "post_auth_logout" {
  api_id             = local.api_id
  route_key          = "POST /auth/logout"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# POST /auth/username
resource "aws_apigatewayv2_route" "post_auth_username" {
  api_id             = local.api_id
  route_key          = "POST /auth/username"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# ---------- OAUTH (mounted at /auth/oauth) ----------
# NOTE: OAuth flows must not be gated by the custom authorizer
# because providers call the callback without browser Origin headers.
# Set authorization_type = NONE for all start/callback routes.

# GET /auth/oauth/google/start
resource "aws_apigatewayv2_route" "get_auth_oauth_google_start" {
  api_id             = local.api_id
  route_key          = "GET /auth/oauth/google/start"
  target             = "integrations/${local.int_id}"
  authorization_type = "NONE"
}

# GET /auth/oauth/google/callback
resource "aws_apigatewayv2_route" "get_auth_oauth_google_callback" {
  api_id             = local.api_id
  route_key          = "GET /auth/oauth/google/callback"
  target             = "integrations/${local.int_id}"
  authorization_type = "NONE"
}

# GET /auth/oauth/github/start
resource "aws_apigatewayv2_route" "get_auth_oauth_github_start" {
  api_id             = local.api_id
  route_key          = "GET /auth/oauth/github/start"
  target             = "integrations/${local.int_id}"
  authorization_type = "NONE"
}

# GET /auth/oauth/github/callback
resource "aws_apigatewayv2_route" "get_auth_oauth_github_callback" {
  api_id             = local.api_id
  route_key          = "GET /auth/oauth/github/callback"
  target             = "integrations/${local.int_id}"
  authorization_type = "NONE"
}

# GET /auth/oauth/discord/start
resource "aws_apigatewayv2_route" "get_auth_oauth_discord_start" {
  api_id             = local.api_id
  route_key          = "GET /auth/oauth/discord/start"
  target             = "integrations/${local.int_id}"
  authorization_type = "NONE"
}

# GET /auth/oauth/discord/callback
resource "aws_apigatewayv2_route" "get_auth_oauth_discord_callback" {
  api_id             = local.api_id
  route_key          = "GET /auth/oauth/discord/callback"
  target             = "integrations/${local.int_id}"
  authorization_type = "NONE"
}

# ---------- AUTH (root-level aliases) ----------
# GET /check
resource "aws_apigatewayv2_route" "get_check_root" {
  api_id             = local.api_id
  route_key          = "GET /check"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# POST /logout
resource "aws_apigatewayv2_route" "post_logout_root" {
  api_id             = local.api_id
  route_key          = "POST /logout"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# ---------- AVAILABILITY (mounted at /availability) ----------
# GET /availability/get
resource "aws_apigatewayv2_route" "get_availability_get" {
  api_id             = local.api_id
  route_key          = "GET /availability/get"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# POST /availability/save
resource "aws_apigatewayv2_route" "post_availability_save" {
  api_id             = local.api_id
  route_key          = "POST /availability/save"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# POST /availability/get_many
resource "aws_apigatewayv2_route" "post_availability_get_many" {
  api_id             = local.api_id
  route_key          = "POST /availability/get_many"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# ---------- USER SETTINGS (root-mounted) ----------
# GET /settings
resource "aws_apigatewayv2_route" "get_settings" {
  api_id             = local.api_id
  route_key          = "GET /settings"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# POST /settings
resource "aws_apigatewayv2_route" "post_settings" {
  api_id             = local.api_id
  route_key          = "POST /settings"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# ---------- USERS (mounted at /users) ----------
# GET /users/exists
resource "aws_apigatewayv2_route" "get_users_exists" {
  api_id             = local.api_id
  route_key          = "GET /users/exists"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# ---------- TEMPLATES (mounted at /templates) ----------
# GET /templates/list
resource "aws_apigatewayv2_route" "get_templates_list" {
  api_id             = local.api_id
  route_key          = "GET /templates/list"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# GET /templates (alias of list)
resource "aws_apigatewayv2_route" "get_templates_root" {
  api_id             = local.api_id
  route_key          = "GET /templates"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# GET /templates/get
resource "aws_apigatewayv2_route" "get_templates_get" {
  api_id             = local.api_id
  route_key          = "GET /templates/get"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# GET /templates/{id}
resource "aws_apigatewayv2_route" "get_templates_id" {
  api_id             = local.api_id
  route_key          = "GET /templates/{id}"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# POST /templates/save
resource "aws_apigatewayv2_route" "post_templates_save" {
  api_id             = local.api_id
  route_key          = "POST /templates/save"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# POST /templates (alias of save)
resource "aws_apigatewayv2_route" "post_templates_root" {
  api_id             = local.api_id
  route_key          = "POST /templates"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# PUT /templates/{id}
resource "aws_apigatewayv2_route" "put_templates_id" {
  api_id             = local.api_id
  route_key          = "PUT /templates/{id}"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# POST /templates/delete
resource "aws_apigatewayv2_route" "post_templates_delete" {
  api_id             = local.api_id
  route_key          = "POST /templates/delete"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# DELETE /templates/{id}
resource "aws_apigatewayv2_route" "delete_templates_id" {
  api_id             = local.api_id
  route_key          = "DELETE /templates/{id}"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}

# DELETE /templates
resource "aws_apigatewayv2_route" "delete_templates_root" {
  api_id             = local.api_id
  route_key          = "DELETE /templates"
  target             = "integrations/${local.int_id}"
  authorization_type = "CUSTOM"
  authorizer_id      = local.authz
}
