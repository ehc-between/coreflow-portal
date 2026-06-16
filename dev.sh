#!/usr/bin/env bash
#
# dev.sh — CoreFlow portal dev helper. Selects the right Node (24) via nvm, then
# wraps the common npm commands. Run `./dev.sh help`.
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24 >/dev/null 2>&1 || { echo "Node 24 not installed via nvm — run: nvm install 24"; exit 1; }

if [ -t 1 ]; then GRN=$'\033[32m'; YLW=$'\033[33m'; RST=$'\033[0m'; else GRN=''; YLW=''; RST=''; fi
info() { printf '%s==>%s %s\n' "$GRN" "$RST" "$*"; }

usage() {
  cat <<EOF
${GRN}CoreFlow portal — dev.sh${RST}  (Node $(node -v))

  install            npm install
  start | serve      ng serve on :4200
  build              production build
  lint | fmt         eslint / prettier
  test               unit tests (vitest)
  check              lint + test + build (the "done" gate)
EOF
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  install)      info "npm install";      npm install ;;
  start|serve)  info "ng serve :4200";   npm start ;;
  build)        info "production build"; npm run build ;;
  lint)         npm run lint ;;
  fmt|format)   npm run format ;;
  test)         npm test ;;
  check)        info "lint";  npm run lint;
                info "test";  npm test;
                info "build"; npm run build;
                info "all green ✓" ;;
  help|-h|--help) usage ;;
  *)            echo "unknown command: $cmd"; usage; exit 1 ;;
esac
