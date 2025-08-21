############################################################
# EKS Access: grant cluster-admin to your console admin and CI
# - Admin: manage ONLY the policy association (no access_entry resource)
# - CI:    manage both access_entry + association
############################################################

variable "admin_principal_arn" {
  description = "IAM ARN (user or role) that should be EKS ClusterAdmin (your console identity)"
  type        = string
}

# Admin: cluster-admin via Access Policy (EKS will create the entry if missing)
resource "aws_eks_access_policy_association" "admin" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.admin_principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope { type = "cluster" }
}

# CI principal (GitHub OIDC role) gets cluster-admin as well
resource "aws_eks_access_entry" "github_ci" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.github_ci.arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "github_ci" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.github_ci.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope { type = "cluster" }
}
