############################################################
# Admin IAM user + group for interactive console use
# - User: eks-operator   (change via var.admin_console_username if you like)
# - Group: <project>-admins
# - Group gets AdministratorAccess (bootstrap simplicity)
# - MFA is enforced for all APIs (with minimal exceptions to enroll MFA)
#
# After apply:
# 1) In AWS Console, set a console password for the user
# 2) Enroll MFA for the user
# 3) Copy output admin_user_arn into GitHub secret EKS_ADMIN_PRINCIPAL_ARN
############################################################

variable "admin_console_username" {
  description = "IAM username for the human console admin"
  type        = string
  default     = "eks-operator"
}

# Uses your existing var.project_name (e.g., "nat20")
resource "aws_iam_group" "admins" {
  name = "${var.project_name}-admins"
  tags = { Name = "${var.project_name}-admins" }
}

# Bootstrap convenience; tighten later if desired
resource "aws_iam_group_policy_attachment" "admins_adminaccess" {
  group      = aws_iam_group.admins.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# Deny everything unless MFA is present, except minimal IAM/STS to enroll/maintain MFA & change password
data "aws_iam_policy_document" "mfa_enforce" {
  statement {
    sid     = "DenyAllIfNoMFA"
    effect  = "Deny"

    not_actions = [
      "iam:GetUser",
      "iam:ListUsers",
      "iam:ChangePassword",

      "iam:CreateVirtualMFADevice",
      "iam:DeleteVirtualMFADevice",
      "iam:EnableMFADevice",
      "iam:DeactivateMFADevice",
      "iam:ResyncMFADevice",
      "iam:ListMFADevices",
      "iam:ListVirtualMFADevices",

      "sts:GetSessionToken"
    ]
    resources = ["*"]

    condition {
      test     = "BoolIfExists"
      variable = "aws:MultiFactorAuthPresent"
      values   = ["false"]
    }
  }
}

resource "aws_iam_policy" "mfa_enforce" {
  name        = "${var.project_name}-mfa-enforce"
  description = "Deny all API calls unless MFA is present (with minimal exceptions for MFA enrollment)."
  policy      = data.aws_iam_policy_document.mfa_enforce.json
}

resource "aws_iam_group_policy_attachment" "admins_mfa_enforce" {
  group      = aws_iam_group.admins.name
  policy_arn = aws_iam_policy.mfa_enforce.arn
}

# The human console user (no access keys are created here)
resource "aws_iam_user" "console_admin" {
  name = var.admin_console_username
  tags = { Name = var.admin_console_username }
}

resource "aws_iam_user_group_membership" "console_admin_groups" {
  user   = aws_iam_user.console_admin.name
  groups = [aws_iam_group.admins.name]
}

output "admin_user_arn" {
  value       = aws_iam_user.console_admin.arn
  description = "Use this ARN in GitHub secret EKS_ADMIN_PRINCIPAL_ARN"
}
