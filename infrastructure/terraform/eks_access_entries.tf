############################################################
# EKS Access Entries:
#  - Cluster-scoped admin for your IAM user (nat20-admin)
#  - Namespace-scoped admin for CI role (nat20)
############################################################

# Your admin IAM USER (programmatic creds you control)
resource "aws_iam_user" "nat20_admin" {
  name = "nat20-admin"
  tags = { Name = "nat20-admin" }
}

# Lookup managed access policy ARNs
data "aws_eks_access_policies" "all" {}

locals {
  cluster_admin_policy_arn = one([
    for p in data.aws_eks_access_policies.all.access_policies : p.arn
    if p.name == "AmazonEKSClusterAdminPolicy"
  ])
  admin_policy_arn = one([
    for p in data.aws_eks_access_policies.all.access_policies : p.arn
    if p.name == "AmazonEKSAdminPolicy"
  ])

  ci_namespaces = ["nat20"] # adjust if you add more
}

# ---- You: cluster admin via Access Entry ----
resource "aws_eks_access_entry" "you" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_user.nat20_admin.arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "you_cluster" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_user.nat20_admin.arn
  policy_arn    = local.cluster_admin_policy_arn

  access_scope { type = "cluster" }
}

# ---- CI: namespace-scoped admin for nat20 ----
# (uses the CI role from iam_github_ci.tf)
resource "aws_eks_access_entry" "ci" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.ci.arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "ci_ns" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.ci.arn
  policy_arn    = local.admin_policy_arn

  access_scope {
    type       = "namespace"
    namespaces = local.ci_namespaces
  }
}
