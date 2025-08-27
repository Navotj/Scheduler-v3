#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT}/src"
OUT="${ROOT}/site"

read_file() { cat "$1"; }

resolve_includes() {
  local file="$1"
  local base; base="$(dirname "$file")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ <!--[[:space:]]*@include[[:space:]]+(.+)[[:space:]]*--> ]]; then
      local inc_rel="${BASH_REMATCH[1]}"
      local inc_abs="${base}/${inc_rel}"
      [[ -f "$inc_abs" ]] || { echo "include not found: $inc_abs" >&2; exit 1; }
      resolve_includes "$inc_abs"
    else
      printf '%s\n' "$line"
    fi
  done < "$file"
}

copy_dir_if_exists() {
  local src="$1" dst="$2"
  [[ -d "$src" ]] || return 0
  mkdir -p "$dst"
  ( shopt -s dotglob nullglob; cp -R "$src"/* "$dst"/ )
}

main() {
  rm -rf "$OUT"
  mkdir -p "$OUT"

  # pages: expand includes into OUT root
  for page in "${SRC}/pages"/*.html; do
    [[ -e "$page" ]] || continue
    local_name="$(basename "$page")"
    resolve_includes "$page" > "${OUT}/${local_name}"
  done

  # static assets
  copy_dir_if_exists "${SRC}/styles"  "${OUT}/styles"
  copy_dir_if_exists "${SRC}/scripts" "${OUT}/scripts"
  copy_dir_if_exists "${SRC}/assets"  "${OUT}/assets"

  echo "build complete -> ${OUT}"
}

main "$@"
