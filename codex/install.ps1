#requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function RegisterAgent($agent, $label) {
  node (Join-Path $engineDir "tools\agent-integration\register.mjs") --agent $agent --label $label
  if ($LASTEXITCODE -ne 0) { throw "Brain integration registration failed" }
}

$engineDir = if ($env:BRAIN_ENGINE_ROOT) { $env:BRAIN_ENGINE_ROOT } else { Join-Path $env:USERPROFILE ".local\brain-engine" }
$codexDir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
$skillsDir = Join-Path $codexDir "skills"
$repoUrl = if ($env:BRAIN_ENGINE_REPO) { $env:BRAIN_ENGINE_REPO } else { "https://github.com/kooropatfa/brain.git" }

Write-Host "Brain for Codex - setup"

foreach ($cmd in @("node", "git", "gh")) {
  if (-not (Have $cmd)) {
    throw "Missing prerequisite: $cmd. Install Node, Git, and GitHub CLI, then re-run this script."
  }
}

if (Test-Path (Join-Path $engineDir ".git")) {
  git -C $engineDir pull --ff-only
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path $engineDir) | Out-Null
  git clone $repoUrl $engineDir
}

RegisterAgent "codex" "Codex"

New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null
$target = Join-Path $skillsDir "brain"
if (Test-Path $target) {
  $item = Get-Item $target -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    Remove-Item -Force $target
  } else {
    $backup = Join-Path $skillsDir ("brain.backup." + (Get-Date -Format "yyyyMMddHHmmss"))
    Move-Item -Force $target $backup
    Write-Host "Existing Codex brain skill moved to: $backup"
  }
}

$source = Join-Path $engineDir "codex\skills\brain"
try {
  New-Item -ItemType Junction -Path $target -Target $source | Out-Null
} catch {
  Copy-Item -Recurse -Force $source $target
}

node (Join-Path $engineDir "codex\scripts\install-hooks.mjs") --engine-root $engineDir

$authed = $false
try { gh auth status 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $authed = $true } } catch {}
if ($authed) {
  Write-Host "GitHub sign-in already configured."
} else {
  Write-Host "Opening browser GitHub sign-in..."
  gh auth login --hostname github.com --git-protocol https --web
}

Write-Host "Installed Codex skill: $target"
Write-Host "Installed Codex SessionStart hook in: $(Join-Path $codexDir "hooks.json")"
Write-Host "Engine checkout: $engineDir"
Write-Host "Next: connect a Brain with:"
Write-Host "  node `"$target\scripts\brain-tool.mjs`" brain-sync connect --repo <owner/name>"
