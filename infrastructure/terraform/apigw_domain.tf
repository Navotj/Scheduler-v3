########################################
# API custom domain and mapping
########################################

resource "aws_apigatewayv2_domain_name" "api_domain" {
  domain_name = local.api_domain
  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "api_map" {
  api_id      = aws_apigatewayv2_api.backend_api.id
  domain_name = aws_apigatewayv2_domain_name.api_domain.domain_name
  stage       = aws_apigatewayv2_stage.prod.name
}
