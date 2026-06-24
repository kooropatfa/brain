#!/usr/bin/env bash
set -euo pipefail

have() { command -v "$1" >/dev/null 2>&1; }
say() { printf '%s\n' "$1"; }
claim_agent() {
  local agent="$1" label="$2"
  local state_dir="${BRAIN_STATE_DIR:-$HOME/.brain}"
  local state_file="$state_dir/agent-integration.json"
  if [ -f "$state_file" ]; then
    local existing
    existing="$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).agent||'')}catch{}" "$state_file")"
    if [ "$existing" = "$agent" ]; then
      say "Brain already selected for $label ($state_file). Refreshing installation."
      return 0
    fi
    if [ -n "$existing" ]; then
      say "Brain is already installed for '$existing' on this machine."
      say "Refusing to install it for '$agent' as well. Choose one agent integration at a time."
      say "To switch intentionally, remove $state_file and uninstall the previous integration first."
      exit 1
    fi
  fi
  mkdir -p "$state_dir"
  node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({agent:process.argv[2], label:process.argv[3], installed_at:new Date().toISOString()}, null, 2)+'\n')" "$state_file" "$agent" "$label"
  say "Brain selected for $label ($state_file)"
}

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

claim_agent "codex" "Codex"

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

node "$ENGINE_DIR/codex/scripts/install-hooks.mjs" --engine-root "$ENGINE_DIR"

if gh auth status >/dev/null 2>&1; then
  say "GitHub sign-in already configured."
else
  say "Opening browser GitHub sign-in..."
  gh auth login --hostname github.com --git-protocol https --web
fi

say "Installed Codex skill: $SKILLS_DIR/brain"
say "Installed Codex SessionStart hook in: $CODEX_DIR/hooks.json"
say "Engine checkout: $ENGINE_DIR"
say "Next: connect a Brain with:"
say "  node \"$SKILLS_DIR/brain/scripts/brain-tool.mjs\" brain-sync connect --repo <owner/name>"
