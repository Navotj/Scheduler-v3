############################################################
# Helm: AWS Load Balancer Controller + External Secrets + EBS CSI
############################################################

# Namespace for external-secrets
resource "kubernetes_namespace" "externalsecrets" {
  metadata { name = "externalsecrets" }
}

# ALB Controller (kube-system SA)
resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.9.0"

  values = [
    yamlencode({
      clusterName = aws_eks_cluster.this.name
      region      = data.aws_region.current.name
      vpcId       = data.aws_vpc.default.id
      serviceAccount = {
        create = true
        name   = "aws-load-balancer-controller"
        annotations = {
          "eks.amazonaws.com/role-arn" = aws_iam_role.alb_controller.arn
        }
      }
      enableServiceMutatorWebhook = true
    })
  ]

  depends_on = [aws_eks_node_group.default]
}

# External Secrets Operator
resource "helm_release" "external_secrets" {
  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  namespace  = kubernetes_namespace.externalsecrets.metadata[0].name
  version    = "0.9.13"

  values = [
    yamlencode({
      serviceAccount = {
        create = true
        name   = "external-secrets"
        annotations = {
          "eks.amazonaws.com/role-arn" = aws_iam_role.external_secrets.arn
        }
      }
    })
  ]

  depends_on = [aws_eks_node_group.default]
}

# EBS CSI Driver
resource "helm_release" "aws_ebs_csi_driver" {
  name       = "aws-ebs-csi-driver"
  repository = "https://kubernetes-sigs.github.io/aws-ebs-csi-driver"
  chart      = "aws-ebs-csi-driver"
  namespace  = "kube-system"
  version    = "2.35.0"

  values = [
    yamlencode({
      controller = {
        serviceAccount = {
          create = true
          name   = "ebs-csi-controller-sa"
          annotations = {
            "eks.amazonaws.com/role-arn" = aws_iam_role.ebs_csi.arn
          }
        }
      }
    })
  ]

  depends_on = [aws_eks_node_group.default]
}

# gp3 storage class (default)
resource "kubernetes_storage_class" "gp3" {
  metadata {
    name = "gp3"
    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "true"
    }
  }
  storage_provisioner    = "ebs.csi.aws.com"
  volume_binding_mode    = "WaitForFirstConsumer"
  allow_volume_expansion = true
  parameters = {
    type = "gp3"
    iops = "3000"
    throughput = "125"
    encrypted  = "true"
  }
}
