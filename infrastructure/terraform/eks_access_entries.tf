############################################################
# EKS Access: grant cluster-admin to your console admin and CI
############################################################

variable "admin_principal_arn" {
  description = "IAM ARN (user or role) that should be EKS ClusterAdmin (your console identity)"
  type        = string
}

# Admin: ensure Access Entry exists, then associate ClusterAdmin policy
resource "aws_eks_access_entry" "admin" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.admin_principal_arn
  type          = "STANDARD"
  user_name     = "admin"
}

resource "aws_eks_access_policy_association" "admin" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_eks_access_entry.admin.principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope { type = "cluster" }

  depends_on = [aws_eks_access_entry.admin]
}

# CI principal (GitHub OIDC role) gets cluster-admin as well
resource "aws_eks_access_entry" "github_ci" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.github_ci.arn
  type          = "STANDARD"
  user_name     = "github-ci"
}

resource "aws_eks_access_policy_association" "github_ci" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_eks_access_entry.github_ci.principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope { type = "cluster" }

  depends_on = [aws_eks_access_entry.github_ci]
}
