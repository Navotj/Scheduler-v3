############################################################
# Kubernetes/Helm addons (gated to avoid plan-time provider init)
# 1) terraform apply (install_addons=false) -> creates EKS + node group
# 2) terraform apply -var='install_addons=true' -> installs addons (where applicable)
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
    aws_iam_openid_connect_provider.eks,
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
# Install unconditionally so Ingress provisioning always works
resource "helm_release" "aws_load_balancer_controller" {
  count      = 1
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

  # Ensure the IngressClass "alb" exists
  set {
    name  = "ingressClass"
    value = "alb"
  }
  # Chart key is createIngressClassResource
  set {
    name  = "createIngressClassResource"
    value = "true"
  }
  set {
    name  = "defaultIngressClass"
    value = "false"
  }

  # ServiceAccount with IRSA annotation (reuse existing role)
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
    aws_iam_openid_connect_provider.eks,
    aws_iam_role.alb_controller,
    aws_iam_role_policy_attachment.alb_controller_attach
  ]
}

# External Secrets Operator (installs CRDs) with IRSA
resource "helm_release" "external_secrets" {
  count      = 1
  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  namespace  = "externalsecrets"
  # version intentionally not pinned here; pin if you require reproducibility

  # Install CRDs so ClusterSecretStore/ExternalSecret kinds exist
  set {
    name  = "installCRDs"
    value = "true"
  }

  # Use IRSA role created in iam_irsa.tf
  set {
    name  = "serviceAccount.create"
    value = "true"
  }
  set {
    name  = "serviceAccount.name"
    value = "external-secrets"
  }
  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.external_secrets.arn
  }

  timeout = 600

  depends_on = [
    aws_eks_cluster.this,
    aws_eks_node_group.default,
    aws_iam_openid_connect_provider.eks,
    kubernetes_namespace.externalsecrets,
    aws_iam_role.external_secrets,
    aws_iam_role_policy_attachment.external_secrets_attach
  ]
}
