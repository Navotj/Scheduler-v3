############################################################
# EKS Access Entries (new EKS auth) for:
#  - Your admin principal (user/role you control)
#  - The GitHub CI role (so Helm/K8s providers can talk to the cluster)
############################################################

variable "admin_principal_arn" {
  type        = string
  description = "IAM ARN (user or role) that should be EKS ClusterAdmin (your console identity)"
}

# Admin (you)
resource "aws_eks_access_entry" "admin" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.admin_principal_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "admin" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.admin_principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }
}

# GitHub CI role (created in iam_github_ci.tf)
resource "aws_eks_access_entry" "github_ci" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.github_ci.arn
  type          = "STANDARD"

  depends_on = [aws_iam_role.github_ci]
}

resource "aws_eks_access_policy_association" "github_ci" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.github_ci.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.github_ci]
}
