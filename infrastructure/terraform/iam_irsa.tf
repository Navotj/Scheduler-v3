############################################################
# OIDC + IRSA roles for:
# - AWS Load Balancer Controller
# - External Secrets Operator (SSM)
# - EBS CSI Driver
############################################################

# Derive OIDC provider URL/ARN for IRSA
locals {
  oidc_provider_url = replace(aws_eks_cluster.this.identity[0].oidc[0].issuer, "https://", "")
  oidc_provider_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${local.oidc_provider_url}"
}

##########################
# AWS Load Balancer Controller
##########################

data "aws_iam_policy_document" "alb_controller_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_provider_url}:sub"
      values   = ["system:serviceaccount:kube-system:aws-load-balancer-controller"]
    }
  }
}

resource "aws_iam_role" "alb_controller" {
  name               = "${var.project_name}-alb-controller-irsa"
  assume_role_policy = data.aws_iam_policy_document.alb_controller_trust.json
  tags               = { Name = "${var.project_name}-alb-controller-irsa" }
}

resource "aws_iam_policy" "alb_controller" {
  name   = "${var.project_name}-alb-controller-policy"
  policy = file("${path.module}/policies/aws-lbc-policy.json")
}

resource "aws_iam_role_policy_attachment" "alb_controller_attach" {
  role       = aws_iam_role.alb_controller.name
  policy_arn = aws_iam_policy.alb_controller.arn
}

##########################
# External Secrets (SSM)
##########################

data "aws_iam_policy_document" "external_secrets_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_provider_url}:sub"
      values   = ["system:serviceaccount:externalsecrets:external-secrets"]
    }
  }
}

data "aws_iam_policy_document" "external_secrets_policy" {
  statement {
    sid     = "ReadSSMParams"
    effect  = "Allow"
    actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/nat20/*"
    ]
  }
}

resource "aws_iam_role" "external_secrets" {
  name               = "${var.project_name}-external-secrets-irsa"
  assume_role_policy = data.aws_iam_policy_document.external_secrets_trust.json
  tags               = { Name = "${var.project_name}-external-secrets-irsa" }
}

resource "aws_iam_policy" "external_secrets" {
  name   = "${var.project_name}-external-secrets-policy"
  policy = data.aws_iam_policy_document.external_secrets_policy.json
}

resource "aws_iam_role_policy_attachment" "external_secrets_attach" {
  role       = aws_iam_role.external_secrets.name
  policy_arn = aws_iam_policy.external_secrets.arn
}

##########################
# EBS CSI Driver
##########################

data "aws_iam_policy_document" "ebs_csi_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_provider_url}:sub"
      values   = ["system:serviceaccount:kube-system:ebs-csi-controller-sa"]
    }
  }
}

resource "aws_iam_role" "ebs_csi" {
  name               = "${var.project_name}-ebs-csi-irsa"
  assume_role_policy = data.aws_iam_policy_document.ebs_csi_trust.json
  tags               = { Name = "${var.project_name}-ebs-csi-irsa" }
}

resource "aws_iam_role_policy_attachment" "ebs_csi_attach" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}
