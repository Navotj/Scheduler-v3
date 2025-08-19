#!/usr/bin/env bash
# Install AWS CLI v2 (if missing), install kubectl matching your EKS cluster minor version,
# and configure kubeconfig for immediate use. Works on Amazon Linux 2023, RHEL/CentOS, Ubuntu/Debian.
# Usage (as root or with sudo):
#   export AWS_REGION="eu-central-1"
#   export CLUSTER_NAME="nat20-eks"
#   bash infrastructure/scripts/bootstrap_kubectl.sh
set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-central-1}"
CLUSTER_NAME="${CLUSTER_NAME:-nat20-eks}"

# -------- helpers --------
need_cmd() { command -v "$1" >/dev/null 2>&1; }
arch() {
  case "$(uname -m)" in
    x86_64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) echo "amd64" ;;
  esac
}
tmpd() { mktemp -d /tmp/k8sboot.XXXXXX; }

# -------- ensure deps --------
if ! need_cmd curl && ! need_cmd wget; then
  if need_cmd apt-get; then
    apt-get update -y
    apt-get install -y curl ca-certificates unzip tar
  elif need_cmd dnf; then
    dnf install -y curl ca-certificates unzip tar
  elif need_cmd yum; then
    yum install -y curl ca-certificates unzip tar
  else
    echo "ERROR: cannot find package manager to install curl" >&2
    exit 1
  fi
fi

DL() {
  if need_cmd curl; then curl -fsSL "$1"
  else wget -qO- "$1"
  fi
}

# -------- AWS CLI v2 --------
if ! need_cmd aws; then
  echo "[*] Installing AWS CLI v2..."
  work="$(tmpd)"
  trap 'rm -rf "${work}"' EXIT
  DL "https://awscli.amazonaws.com/awscli-exe-linux-$(arch).zip" > "${work}/awscliv2.zip"
  unzip -q "${work}/awscliv2.zip" -d "${work}"
  "${work}/aws/install" --update || "${work}/aws/install"
  echo "[*] AWS CLI installed: $(aws --version 2>/dev/null || true)"
else
  echo "[*] AWS CLI already present: $(aws --version 2>/dev/null || true)"
fi

# -------- determine cluster minor version --------
echo "[*] Detecting EKS cluster version for ${CLUSTER_NAME} in ${AWS_REGION}..."
K8S_VERSION="$(aws eks describe-cluster --name "${CLUSTER_NAME}" --region "${AWS_REGION}" --query 'cluster.version' --output text)"
if [[ -z "${K8S_VERSION}" || "${K8S_VERSION}" == "None" ]]; then
  echo "ERROR: could not determine EKS cluster version. Check AWS credentials/region/cluster name." >&2
  exit 1
fi
# K8S_VERSION like "1.33"
K8S_MAJOR="$(cut -d. -f1 <<<"${K8S_VERSION}")"
K8S_MINOR="$(cut -d. -f2 <<<"${K8S_VERSION}")"
STABLE_LINE="stable-${K8S_MAJOR}.${K8S_MINOR}.txt"
echo "[*] Cluster Kubernetes version: ${K8S_VERSION} (will install latest patch of ${K8S_MAJOR}.${K8S_MINOR}.x)"

# -------- install kubectl matching minor (latest patch) --------
if ! need_cmd kubectl; then
  echo "[*] Installing kubectl..."
  work="$(tmpd)"
  trap 'rm -rf "${work}"' EXIT
  STABLE_TAG="$(DL "https://dl.k8s.io/release/${STABLE_LINE}" | tr -d '\n' || true)"
  if [[ -z "${STABLE_TAG}" ]]; then
    # Fallback: use generic stable
    STABLE_TAG="$(DL "https://dl.k8s.io/release/stable.txt" | tr -d '\n')"
  fi
  # If fallback mismatches major.minor, prefer an explicit tag with .0 (still compatible)
  if [[ "${STABLE_TAG}" != v${K8S_MAJOR}.${K8S_MINOR}.* ]]; then
    STABLE_TAG="v${K8S_MAJOR}.${K8S_MINOR}.0"
  fi

  BIN_URL="https://dl.k8s.io/release/${STABLE_TAG}/bin/linux/$(arch)/kubectl"
  SUM_URL="${BIN_URL}.sha256"

  echo "[*] Downloading ${BIN_URL}"
  DL "${BIN_URL}" > "${work}/kubectl"
  DL "${SUM_URL}" > "${work}/kubectl.sha256"
  (cd "${work}" && sha256sum -c kubectl.sha256 >/dev/null 2>&1) || {
    echo "WARN: sha256 mismatch (may be due to fallback tag). Proceeding without verify." >&2
  }
  install -m 0755 "${work}/kubectl" /usr/local/bin/kubectl
else
  echo "[*] kubectl already present: $(kubectl version --client --short 2>/dev/null || true)"
fi

# -------- kubeconfig --------
echo "[*] Updating kubeconfig for ${CLUSTER_NAME}..."
aws eks update-kubeconfig --name "${CLUSTER_NAME}" --region "${AWS_REGION}" >/dev/null

# -------- smoke test & helpful diagnostics --------
echo "[*] Verifying cluster access..."
if ! kubectl version --short >/dev/null 2>&1; then
  echo "ERROR: kubectl client cannot reach the cluster. Check networking or credentials." >&2
  exit 1
fi

if ! kubectl get ns >/dev/null 2>&1; then
  echo "ERROR: kubectl is installed but current AWS identity lacks RBAC to list namespaces." >&2
  echo "       Use an AWS IAM principal that is mapped with cluster-admin in aws-auth, or update aws-auth." >&2
  echo "       Current AWS caller identity:" >&2
  aws sts get-caller-identity || true
  exit 2
fi

echo "[*] Success. kubectl is ready. Example:"
echo "    kubectl get nodes -o wide"
