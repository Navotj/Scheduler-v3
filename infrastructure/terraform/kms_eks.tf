############################################################
# KMS for EKS Secrets Encryption
############################################################

resource "aws_kms_key" "eks" {
  description             = "KMS key for EKS secrets envelope encryption (${var.project_name})"
  deletion_window_in_days = 7
  enable_key_rotation     = true
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${var.project_name}-eks-secrets"
  target_key_id = aws_kms_key.eks.key_id
}
