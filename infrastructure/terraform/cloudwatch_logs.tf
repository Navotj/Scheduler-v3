############################################################
# CloudWatch log group for EKS control plane logs
############################################################

resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${var.project_name}-eks/cluster"
  retention_in_days = var.log_retention_days
}
