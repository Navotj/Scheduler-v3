############################################################
# ECR Repositories for backend and frontend images
############################################################

resource "aws_ecr_repository" "backend" {
  name                 = "${var.project_name}/backend"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = { Name = "${var.project_name}-backend-ecr" }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "${var.project_name}/frontend"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = { Name = "${var.project_name}-frontend-ecr" }
}

output "ecr_backend_uri"  { value = aws_ecr_repository.backend.repository_url }
output "ecr_frontend_uri" { value = aws_ecr_repository.frontend.repository_url }

# SSM to expose ECR URIs for CI templating
resource "aws_ssm_parameter" "ecr_backend_uri" {
  name        = "/nat20/ecr/BACKEND_URI"
  type        = "String"
  value       = aws_ecr_repository.backend.repository_url
  overwrite   = true
}
resource "aws_ssm_parameter" "ecr_frontend_uri" {
  name        = "/nat20/ecr/FRONTEND_URI"
  type        = "String"
  value       = aws_ecr_repository.frontend.repository_url
  overwrite   = true
}
