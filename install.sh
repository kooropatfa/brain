#!/usr/bin/env bash
# brain — macOS/Linux prerequisites installer (no PAT).
#
# What this does (the ONLY things a plugin can't do for you):
#   1. installs Node, Git, and the GitHub CLI if missing (Homebrew on macOS; apt/dnf on Linux)
#   2. installs Claude Code if missing
#   3. signs you in to GitHub in your BROWSER (gh auth login) — no token to copy/paste
# Then it prints the two commands to run INSIDE Claude Code to turn on the skill.
#
# Run it:
#   curl -fsSL https://raw.githubusercontent.com/kooropatfa/brain/main/install.sh | bash
#
# Prefer to read before running? Download, inspect, then run:
#   curl -fsSL https://raw.githubusercontent.com/kooropatfa/brain/main/install.sh -o install.sh
#   less install.sh && bash install.sh

set -euo pipefail

say()  { printf '  \033[36m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m[ok] %s\033[0m\n' "$1"; }
warn() { printf '  \033[33m[!]  %s\033[0m\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

printf '\nBrain — setup (macOS / Linux)\n=====================================\n'

# --- detect package manager ---------------------------------------------------
PM=""
if [[ "$(uname -s)" == "Darwin" ]]; then
  if ! have brew; then
    say "installing Homebrew (you may be prompted for your password) ..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # make brew available for the rest of this run (Apple Silicon vs Intel paths)
    [[ -x /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
    [[ -x /usr/local/bin/brew ]] && eval "$(/usr/local/bin/brew shellenv)"
  fi
  PM="brew"
elif have apt-get; then PM="apt"
elif have dnf;     then PM="dnf"
else warn "no supported package manager (brew/apt/dnf) found - install node, git, gh manually, then re-run."; fi

ensure() { # ensure <cmd> <brew-pkg> <apt-pkg>
  local cmd="$1" brewpkg="$2" aptpkg="$3"
  if have "$cmd"; then ok "$cmd already installed"; return; fi
  case "$PM" in
    brew) say "installing $cmd ..."; brew install "$brewpkg" ;;
    apt)  say "installing $cmd ..."; sudo apt-get update -y && sudo apt-get install -y "$aptpkg" ;;
    dnf)  say "installing $cmd ..."; sudo dnf install -y "$aptpkg" ;;
    *)    warn "please install $cmd manually"; return 1 ;;
  esac
  ok "$cmd installed"
}

ensure node node nodejs
ensure git  git  git
# gh isn't in stock apt; use the official package if brew/dnf didn't cover it.
if ! have gh; then
  case "$PM" in
    brew) brew install gh && ok "gh installed" ;;
    dnf)  sudo dnf install -y gh && ok "gh installed" ;;
    apt)  say "installing gh (GitHub apt repo) ...";
          (type -p wget >/dev/null || sudo apt-get install -y wget) \
          && sudo mkdir -p -m 755 /etc/apt/keyrings \
          && wget -nv -O- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null \
          && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
          && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null \
          && sudo apt-get update -y && sudo apt-get install -y gh && ok "gh installed" ;;
    *)    warn "install gh from https://cli.github.com/ and re-run." ;;
  esac
fi

# --- Claude Code --------------------------------------------------------------
if have claude; then
  ok "Claude Code already installed"
else
  say "installing Claude Code ..."
  curl -fsSL https://claude.ai/install.sh | bash
  ok "Claude Code installed"
fi

# --- GitHub browser sign-in (no token) ----------------------------------------
if gh auth status >/dev/null 2>&1; then
  ok "GitHub sign-in already configured"
else
  say "opening your browser to sign in to GitHub ..."
  gh auth login --hostname github.com --git-protocol https --web
  ok "signed in to GitHub"
fi

# --- Done ---------------------------------------------------------------------
printf '\n\033[37mAlmost there. Open Claude Code and run these two lines:\033[0m\n'
printf '\033[32m    /plugin marketplace add kooropatfa/brain\033[0m\n'
printf '\033[32m    /plugin install brain@brain\033[0m\n\n'
printf '\033[37mThat is it. Your agent now syncs the Brain at the start of every session.\033[0m\n'
printf '\033[37mTo save something, just tell it: add this to the brain\033[0m\n\n'
