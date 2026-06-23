#!/usr/bin/env bash
set -euo pipefail

have() { command -v "$1" >/dev/null 2>&1; }
say() { printf '%s\n' "$1"; }

ENGINE_DIR="${BRAIN_ENGINE_ROOT:-$HOME/.local/brain-engine}"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
SKILLS_DIR="$CODEX_DIR/skills"
REPO_URL="${BRAIN_ENGINE_REPO:-https://github.com/kooropatfa/brain.git}"

say "Brain for Codex - setup"

for cmd in node git gh; do
  if ! have "$cmd"; then
    say "Missing prerequisite: $cmd"
    say "Install Node, Git, and GitHub CLI, then re-run this script."
    exit 1
  fi
done

if [ -d "$ENGINE_DIR/.git" ]; then
  git -C "$ENGINE_DIR" pull --ff-only
else
  mkdir -p "$(dirname "$ENGINE_DIR")"
  git clone "$REPO_URL" "$ENGINE_DIR"
fi

mkdir -p "$SKILLS_DIR"
if [ -e "$SKILLS_DIR/brain" ] || [ -L "$SKILLS_DIR/brain" ]; then
  if [ -L "$SKILLS_DIR/brain" ]; then
    rm "$SKILLS_DIR/brain"
  else
    backup="$SKILLS_DIR/brain.backup.$(date +%Y%m%d%H%M%S)"
    mv "$SKILLS_DIR/brain" "$backup"
    say "Existing Codex brain skill moved to: $backup"
  fi
fi
ln -s "$ENGINE_DIR/codex/skills/brain" "$SKILLS_DIR/brain"

if gh auth status >/dev/null 2>&1; then
  say "GitHub sign-in already configured."
else
  say "Opening browser GitHub sign-in..."
  gh auth login --hostname github.com --git-protocol https --web
fi

say "Installed Codex skill: $SKILLS_DIR/brain"
say "Engine checkout: $ENGINE_DIR"
say "Next: connect a Brain with:"
say "  node \"$SKILLS_DIR/brain/scripts/brain-tool.mjs\" brain-sync connect --repo <owner/name>"
