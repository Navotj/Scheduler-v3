############################################################
# Kubernetes/Helm addons (gated to avoid plan-time provider init)
# 1) terraform apply (install_addons=false) -> creates EKS + node group
# 2) terraform apply -var='install_addons=true' -> installs addons
############################################################

# Namespace for External Secrets
resource "kubernetes_namespace" "externalsecrets" {
  count = var.install_addons ? 1 : 0

  metadata {
    name = "externalsecrets"
    labels = {
      "app.kubernetes.io/name" = "external-secrets"
    }
  }

  depends_on = [
    aws_eks_cluster.this,
    aws_eks_node_group.default
  ]
}

# AWS EBS CSI Driver (IRSA: aws_iam_role.ebs_csi)
resource "helm_release" "aws_ebs_csi_driver" {
  count      = var.install_addons ? 1 : 0
  name       = "aws-ebs-csi-driver"
  repository = "https://kubernetes-sigs.github.io/aws-ebs-csi-driver"
  chart      = "aws-ebs-csi-driver"
  namespace  = "kube-system"
  version    = "2.30.0"

  # Use IRSA role
  set {
    name  = "controller.serviceAccount.create"
    value = "true"
  }
  set {
    name  = "controller.serviceAccount.name"
    value = "ebs-csi-controller-sa"
  }
  set {
    name  = "controller.serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.ebs_csi.arn
  }

  timeout = 600

  depends_on = [
    aws_eks_cluster.this,
    aws_eks_node_group.default,
    aws_iam_role.ebs_csi
  ]
}

# Default StorageClass: gp3 (encrypted)
resource "kubernetes_storage_class" "gp3" {
  count = var.install_addons ? 1 : 0

  metadata {
    name = "gp3"
    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "true"
    }
  }

  storage_provisioner = "ebs.csi.aws.com"

  parameters = {
    type       = "gp3"
    encrypted  = "true"
    fsType     = "xfs"
    iops       = "3000"
    throughput = "125"
  }

  allow_volume_expansion = true
  reclaim_policy         = "Delete"
  volume_binding_mode    = "WaitForFirstConsumer"

  depends_on = [
    helm_release.aws_ebs_csi_driver
  ]
}

# AWS Load Balancer Controller (IRSA: aws_iam_role.alb_controller)
resource "helm_release" "aws_load_balancer_controller" {
  count      = var.install_addons ? 1 : 0
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.8.2"

  set {
    name  = "clusterName"
    value = aws_eks_cluster.this.name
  }
  set {
    name  = "region"
    value = data.aws_region.current.name
  }
  set {
    name  = "vpcId"
    value = data.aws_vpc.default.id
  }

  # ServiceAccount with IRSA annotation
  set {
    name  = "serviceAccount.create"
    value = "true"
  }
  set {
    name  = "serviceAccount.name"
    value = "aws-load-balancer-controller"
  }
  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.alb_controller.arn
  }

  timeout = 600

  depends_on = [
    aws_eks_cluster.this,
    aws_eks_node_group.default,
    aws_iam_role.alb_controller
  ]
}
