############################################################
# EKS Access Entries (optional, safe-by-default)
# - Let you map IAM principals to EKS Access Policies
# - Does NOT require the deprecated aws-auth ConfigMap
#
# Nothing is created unless you set the corresponding variables.
############################################################

variable "admin_principal_arn" {
  description = "IAM Role/User ARN to grant full cluster admin (leave empty to skip)"
  type        = string
  default     = ""
}

variable "github_ci_role_arn" {
  description = "IAM Role ARN used by GitHub Actions OIDC for CI (leave empty to skip)"
  type        = string
  default     = ""
}

locals {
  eks_access_policies = {
    cluster_admin = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
    admin         = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy"
    view          = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSViewPolicy"
  }
}

# --- Admin (optional) ---
resource "aws_eks_access_entry" "admin" {
  count         = length(var.admin_principal_arn) > 0 ? 1 : 0
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.admin_principal_arn
  type          = "STANDARD"
  tags = {
    Name = "${var.project_name}-eks-admin-entry"
  }
}

resource "aws_eks_access_policy_association" "admin_cluster_admin" {
  count         = length(var.admin_principal_arn) > 0 ? 1 : 0
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.admin_principal_arn
  policy_arn    = local.eks_access_policies.cluster_admin

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.admin]
}

# --- GitHub CI (optional) ---
resource "aws_eks_access_entry" "ci" {
  count         = length(var.github_ci_role_arn) > 0 ? 1 : 0
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.github_ci_role_arn
  type          = "STANDARD"
  tags = {
    Name = "${var.project_name}-eks-ci-entry"
  }
}

resource "aws_eks_access_policy_association" "ci_admin" {
  count         = length(var.github_ci_role_arn) > 0 ? 1 : 0
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = var.github_ci_role_arn
  # CI needs cluster-wide admin to apply manifests/ingresses, but not ClusterAdmin.
  policy_arn = local.eks_access_policies.admin

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.ci]
}
