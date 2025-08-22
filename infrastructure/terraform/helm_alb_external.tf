############################################################
# Kubernetes/Helm addons (bootstrap-friendly)
# Phase 1: terraform apply -var='install_addons=false'  -> creates EKS + node group
# Phase 2: terraform apply -var='install_addons=true'   -> installs addons
#
# NOTE:
# - EBS CSI is managed via the EKS managed add-on (created by workflows).
#   We intentionally DO NOT install the Helm chart here to avoid conflicts
#   (immutable label mismatch when both are present).
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

  # Ensure the IngressClass "alb" exists
  set {
    name  = "inressClass" # backward compat if chart tolerates; real key is below
    value = "alb"
  }
  set {
    name  = "ingressClass"
    value = "alb"
  }
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
  count      = var.install_addons ? 1 : 0
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
