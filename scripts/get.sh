#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# Hermes-Web - Universal bootstrap
# ═══════════════════════════════════════════════════════════════════════
#
# One-liner install from anywhere, once the repository is public:
#   bash <(curl -sL https://raw.githubusercontent.com/ChloeVPin/hermes-web/main/scripts/get.sh)
#
# This tiny script:
#   1. Detects if hermes-web is already cloned
#   2. Clones it if needed
#   3. Hands off to the full installer
#
set -euo pipefail

# If piped (curl | bash), save stdin so the full installer can use it
if [ ! -t 0 ]; then
    exec < /dev/tty 2>/dev/null || true
fi

REPO="git@github.com:ChloeVPin/hermes-web.git"
DEST="${HERMES_WEB_DIR:-$HOME/hermes-web}"

G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' R='\033[0m'

if [ -f "$DEST/scripts/install.sh" ]; then
    echo -e "${C}→${R} Updating existing hermes-web at $DEST..."
    (cd "$DEST" && git pull --ff-only 2>/dev/null) || true
else
    echo -e "${C}→${R} Cloning hermes-web..."
    if ! command -v git &>/dev/null; then
        echo -e "${Y}✗${R} git is required. Install it first."
        exit 1
    fi
    git clone --depth 1 "$REPO" "$DEST" 2>/dev/null || {
        echo -e "${Y}✗${R} Failed to clone. Check your internet connection."
        exit 1
    }
    echo -e "${G}✓${R} Cloned to $DEST"
fi

echo ""
exec bash "$DEST/scripts/install.sh"
