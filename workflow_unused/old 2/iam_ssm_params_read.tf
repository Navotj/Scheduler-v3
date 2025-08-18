# iam_ssm_params_read.tf

############################################################
# Policy document ONLY for reading specific SSM parameters.
# (No duplicate data sources; uses ones already declared in
# data_sources.tf: data.aws_region.current & data.aws_caller_identity.current)
############################################################

data "aws_iam_policy_document" "ssm_params_read" {
  statement {
    sid     = "ReadMongoAndBackendParams"
    effect  = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]

    # IMPORTANT: SSM Parameter ARNs do NOT include the leading slash.
    resources = [
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/nat20/backend/JWT_SECRET",
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/USER",
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/PASSWORD",
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/HOST",
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/nat20/mongo/DB",
    ]
  }
}
