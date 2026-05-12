#!/usr/bin/env bash
set -euo pipefail

APP_NAME="guitui"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET="${ROOT_DIR}/bin/guitui.js"
BIN_DIR="${GUITUI_BIN_DIR:-${HOME}/.local/bin}"
LINK_PATH="${BIN_DIR}/${APP_NAME}"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required but was not found on PATH." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "${NODE_MAJOR}" -lt 20 ]; then
  echo "error: Node.js 20 or newer is required. Found: $(node --version)" >&2
  exit 1
fi

if [ ! -f "${TARGET}" ]; then
  echo "error: cannot find CLI target: ${TARGET}" >&2
  exit 1
fi

if [ ! -d "${ROOT_DIR}/node_modules" ]; then
  echo "Installing npm dependencies..."
  (cd "${ROOT_DIR}" && npm install)
fi

mkdir -p "${BIN_DIR}"
chmod +x "${TARGET}"
ln -sfn "${TARGET}" "${LINK_PATH}"

echo "Linked ${APP_NAME} -> ${TARGET}"
echo "Installed command: ${LINK_PATH}"

case ":${PATH}:" in
  *":${BIN_DIR}:"*)
    echo "OK: ${BIN_DIR} is already on PATH."
    ;;
  *)
    echo
    echo "Add this directory to PATH to run '${APP_NAME}' everywhere:"
    echo "  export PATH=\"${BIN_DIR}:\$PATH\""
    echo
    echo "For zsh, you can persist it with:"
    echo "  echo 'export PATH=\"${BIN_DIR}:\$PATH\"' >> ~/.zshrc"
    echo "  source ~/.zshrc"
    ;;
esac

echo
echo "Try it:"
echo "  ${APP_NAME} /path/to/repo"
