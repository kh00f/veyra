#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VEYRA installer
#
#   curl -fsSL https://raw.githubusercontent.com/kh00f/veyra/main/install.sh | bash
#
# Installs VEYRA to ~/.local/share/veyra and links the `veyra` command into
# ~/.local/bin. Does NOT ask for an API key. The first run of `veyra` opens
# the interactive setup flow.
#
# Environment overrides:
#   VEYRA_REPO_URL   override the git clone URL
#   VEYRA_INSTALL_DIR  install location (default ~/.local/share/veyra)
#   VEYRA_BIN_DIR    where to symlink the launcher (default ~/.local/bin)
#   VEYRA_REF        branch/tag to check out (default main)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────
REPO_SLUG="${VEYRA_REPO_SLUG:-kh00f/veyra}"
REPO_URL="${VEYRA_REPO_URL:-https://github.com/${REPO_SLUG}.git}"
INSTALL_DIR="${VEYRA_INSTALL_DIR:-$HOME/.local/share/veyra}"
BIN_DIR="${VEYRA_BIN_DIR:-$HOME/.local/bin}"
REF="${VEYRA_REF:-main}"

# ── Colors (skip if not a TTY or NO_COLOR) ────────────────────────────────
if [ -t 1 ] && [ "${NO_COLOR:-}" != "1" ] && [ "${TERM:-dumb}" != "dumb" ]; then
  MINT="\033[38;5;114m"
  MAGENTA="\033[38;5;175m"
  RED="\033[38;5;174m"
  GOLD="\033[38;5;179m"
  MUTED="\033[38;5;245m"
  DIM="\033[38;5;240m"
  BOLD="\033[1m"
  RESET="\033[0m"
else
  MINT=""; MAGENTA=""; RED=""; GOLD=""; MUTED=""; DIM=""; BOLD=""; RESET=""
fi

ok()    { printf "  ${MINT}✓${RESET} %s\n" "$1"; }
warn()  { printf "  ${GOLD}!${RESET} %s\n" "$1"; }
err()   { printf "  ${RED}✗${RESET} %s\n" "$1" >&2; }
info()  { printf "  ${MUTED}%s${RESET}\n" "$1"; }
step()  { printf "  ${MAGENTA}→${RESET} %s\n" "$1"; }

# ── Banner ────────────────────────────────────────────────────────────────
printf "\n"
printf "  ${MINT}╭─────╮${RESET}\n"
printf "  ${MINT}│${RESET} ${MAGENTA}◉ ◉${RESET} ${MINT}│${RESET}  ${BOLD}${MINT}VEYRA${RESET}\n"
printf "  ${MINT}│${RESET} ${MINT}ᴗᴗ${RESET}  ${MINT}│${RESET}  ${MUTED}installer${RESET}\n"
printf "  ${MINT}╰─┬─┬─╯${RESET}\n"
printf "    ${MINT}╱ ╲${RESET}\n"
printf "\n"

# ── Prereqs ───────────────────────────────────────────────────────────────
missing=""

if ! command -v node >/dev/null 2>&1; then
  err "node is required (Node.js 22 or newer)"
  info "  install: https://nodejs.org/en/download"
  missing="yes"
else
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "${NODE_MAJOR:-0}" -lt 22 ]; then
    err "Node.js 22+ required (found $(node -v 2>/dev/null || echo unknown))"
    missing="yes"
  else
    ok "node $(node -v)"
  fi
fi

if ! command -v git >/dev/null 2>&1; then
  err "git is required"
  info "  install: https://git-scm.com/downloads"
  missing="yes"
else
  ok "git $(git --version | awk '{print $3}')"
fi

if ! command -v npm >/dev/null 2>&1; then
  err "npm is required (usually ships with Node.js)"
  missing="yes"
else
  ok "npm $(npm -v)"
fi

if [ -n "$missing" ]; then
  printf "\n"
  err "install aborted — install the missing prerequisites above and re-run."
  exit 1
fi

# ── Clone or update ───────────────────────────────────────────────────────
printf "\n"

if [ -d "$INSTALL_DIR/.git" ]; then
  step "updating existing install at $INSTALL_DIR"
  if ! git -C "$INSTALL_DIR" fetch --depth=1 origin "$REF" >/dev/null 2>&1; then
    err "git fetch failed — check your network or the ref '$REF'"
    exit 1
  fi
  # Hard reset to the fetched ref so local edits don't block the update.
  git -C "$INSTALL_DIR" reset --hard FETCH_HEAD >/dev/null 2>&1 || {
    err "git reset failed"
    exit 1
  }
  ok "updated to $REF"
else
  step "cloning into $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  if ! git clone --depth=1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1; then
    err "git clone failed — check the repo URL: $REPO_URL"
    exit 1
  fi
  ok "cloned $REPO_SLUG@$REF"
fi

# ── Install dependencies ──────────────────────────────────────────────────
printf "\n"
step "installing npm dependencies (may take a minute)"
cd "$INSTALL_DIR"
if ! npm install --silent --no-audit --no-fund >/dev/null 2>&1; then
  err "npm install failed — run it manually to see the error:"
  info "  cd $INSTALL_DIR && npm install"
  exit 1
fi
ok "dependencies installed"

# ── Make sure bin/veyra.js is executable ──────────────────────────────────
if [ ! -f "$INSTALL_DIR/bin/veyra.js" ]; then
  err "missing $INSTALL_DIR/bin/veyra.js — the repo may be incomplete"
  exit 1
fi
chmod +x "$INSTALL_DIR/bin/veyra.js"

# ── Link ──────────────────────────────────────────────────────────────────
printf "\n"
mkdir -p "$BIN_DIR"
LINK_PATH="$BIN_DIR/veyra"

if [ -L "$LINK_PATH" ] || [ -e "$LINK_PATH" ]; then
  rm -f "$LINK_PATH"
fi
ln -s "$INSTALL_DIR/bin/veyra.js" "$LINK_PATH"
ok "linked $LINK_PATH → $INSTALL_DIR/bin/veyra.js"

# ── PATH check ────────────────────────────────────────────────────────────
case ":$PATH:" in
  *":$BIN_DIR:"*)
    ok "$BIN_DIR is already on your PATH"
    ;;
  *)
    printf "\n"
    warn "$BIN_DIR is not on your PATH"
    info "  add this to your shell rc file (~/.bashrc, ~/.zshrc, or ~/.config/fish/config.fish):"
    printf "\n"
    printf "      ${MINT}export PATH=\"%s:\$PATH\"${RESET}\n" "$BIN_DIR"
    printf "\n"
    info "  then restart your shell, or run:"
    printf "\n"
    printf "      ${MINT}source ~/.bashrc${RESET}    ${DIM}# or your shell's rc${RESET}\n"
    printf "\n"
    ;;
esac

# ── CVE knowledge base — optional, offer to build ─────────────────────────
printf "\n"
INDEX="$INSTALL_DIR/knowledge/cve/index.json"
if [ -f "$INDEX" ]; then
  COUNT=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$INDEX','utf8')).count)}catch{console.log(0)}" 2>/dev/null || echo 0)
  ok "CVE knowledge base present ($COUNT entries)"
else
  info "CVE knowledge base not built."
  info "  VEYRA works without it, but the lookup_cve tool will use live NVD"
  info "  queries only. To build the local corpus (~5,000 CVEs, ~15 min):"
  printf "\n"
  printf "      ${MINT}NVD_API_KEY=<your-key> npx tsx scripts/fetch-cves.ts${RESET}\n"
  printf "\n"
  info "  get a free NVD API key at https://nvd.nist.gov/developers/request-an-api-key"
fi

# ── Done ──────────────────────────────────────────────────────────────────
printf "\n"
printf "  ${MINT}${BOLD}✓ VEYRA installed${RESET}\n"
printf "\n"
printf "  ${BOLD}Next:${RESET}\n"
printf "    ${MINT}veyra${RESET}              ${MUTED}launch the interactive agent${RESET}\n"
printf "\n"
printf "  ${MUTED}The first run opens the provider setup wizard (API key, model).${RESET}\n"
printf "  ${MUTED}You can re-run it any time with:${RESET} ${MINT}veyra setup${RESET}\n"
printf "\n"
