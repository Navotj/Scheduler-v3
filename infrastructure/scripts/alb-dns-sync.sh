#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${NAMESPACE:?NAMESPACE is required}"
: "${INGRESS_NAME:?INGRESS_NAME is required}"
: "${SSM_PARAM_NAME:?SSM_PARAM_NAME is required}"
: "${R53_FQDN:?R53_FQDN is required}"

# 1) Resolve ALB hostname
HOST="$(kubectl -n "$NAMESPACE" get ingress "$INGRESS_NAME" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
if [[ -z "${HOST:-}" || "${HOST}" == "<no value>" ]]; then
  PREFIX="k8s-${NAMESPACE}-${INGRESS_NAME}"
  HOST="$(aws elbv2 describe-load-balancers --region "$AWS_REGION" \
    --query "LoadBalancers[?starts_with(LoadBalancerName, '${PREFIX}')].DNSName | [0]" \
    --output text)"
fi
if [[ -z "${HOST:-}" || "${HOST}" == "None" ]]; then
  echo "ERROR: could not resolve ALB hostname for ${NAMESPACE}/${INGRESS_NAME}"
  exit 1
fi

# 2) Write SSM param if changed
CUR="$(aws ssm get-parameter --region "$AWS_REGION" --name "$SSM_PARAM_NAME" --query 'Parameter.Value' --output text 2>/dev/null || echo "")"
if [[ "${CUR}" != "${HOST}" ]]; then
  aws ssm put-parameter --region "$AWS_REGION" --name "$SSM_PARAM_NAME" --type String --overwrite --value "$HOST" >/dev/null
  echo "SSM ${SSM_PARAM_NAME} updated: ${CUR:-<none>} -> ${HOST}"
else
  echo "SSM ${SSM_PARAM_NAME} already up-to-date (${HOST})"
fi

# 3) Route53: UPSERT A+AAAA aliases to dualstack.HOST
APEX="$(awk -F. '{print $(NF-1)"."$NF}' <<< "$R53_FQDN")"
HZ_ID="$(aws route53 list-hosted-zones-by-name --dns-name "$APEX" --query 'HostedZones[0].Id' --output text | sed 's|/hostedzone/||')"

LB_ARN="$(aws elbv2 describe-load-balancers --region "$AWS_REGION" \
  --query "LoadBalancers[?DNSName=='$HOST'].LoadBalancerArn | [0]" --output text)"
ZONE_ID="$(aws elbv2 describe-load-balancers --region "$AWS_REGION" --load-balancer-arns "$LB_ARN" \
  --query 'LoadBalancers[0].CanonicalHostedZoneId' --output text)"
DUAL="dualstack.${HOST}"

cat > /tmp/r53-upsert.json <<JSON
{"Comment":"Ensure ${R53_FQDN} → ${HOST}","Changes":[
 {"Action":"UPSERT","ResourceRecordSet":{"Name":"${R53_FQDN}","Type":"A",
   "AliasTarget":{"HostedZoneId":"${ZONE_ID}","DNSName":"${DUAL}","EvaluateTargetHealth":true}}},
 {"Action":"UPSERT","ResourceRecordSet":{"Name":"${R53_FQDN}","Type":"AAAA",
   "AliasTarget":{"HostedZoneId":"${ZONE_ID}","DNSName":"${DUAL}","EvaluateTargetHealth":true}}}
]}
JSON
aws route53 change-resource-record-sets --hosted-zone-id "$HZ_ID" --change-batch file:///tmp/r53-upsert.json >/dev/null
echo "Route53 alias ensured: ${R53_FQDN} → ${DUAL}"
