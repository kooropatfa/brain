# brain — Windows prerequisites installer (PowerShell, no admin, no PAT).
#
# What this does (the ONLY things a plugin can't do for you):
#   1. installs Node, Git, and the GitHub CLI if they're missing (via winget; MSI links if winget is absent)
#   2. installs Claude Code if it's missing
#   3. signs you in to GitHub in your BROWSER (gh auth login) — no token to copy/paste
# Then it tells you the two commands to run INSIDE Claude Code to turn on the skill.
#
# Run it (normal, non-admin PowerShell window):
#   irm https://raw.githubusercontent.com/kooropatfa/brain/main/install.ps1 | iex
#
# Nervous about piping a script from the internet (or your antivirus/SmartScreen blocks it)? Good instinct.
# Download it first, read it, then run it:
#   irm https://raw.githubusercontent.com/kooropatfa/brain/main/install.ps1 -OutFile install.ps1
#   notepad install.ps1     # read it
#   powershell -ExecutionPolicy Bypass -File .\install.ps1

#requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Say($msg)  { Write-Host "  $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  [ok] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function RegisterAgent($agent, $label) {
  $rawBase = if ($env:BRAIN_ENGINE_RAW_URL) { $env:BRAIN_ENGINE_RAW_URL } else { "https://raw.githubusercontent.com/kooropatfa/brain/main" }
  $helper = $null
  $tmpHelper = $null
  if ($env:BRAIN_ENGINE_ROOT -and (Test-Path (Join-Path $env:BRAIN_ENGINE_ROOT "tools\agent-integration\register.mjs"))) {
    $helper = Join-Path $env:BRAIN_ENGINE_ROOT "tools\agent-integration\register.mjs"
  } elseif (Test-Path "tools\agent-integration\register.mjs") {
    $helper = "tools\agent-integration\register.mjs"
  } else {
    $tmpHelper = [System.IO.Path]::GetTempFileName()
    Invoke-WebRequest -UseBasicParsing -Uri "$rawBase/tools/agent-integration/register.mjs" -OutFile $tmpHelper
    $helper = $tmpHelper
  }
  try {
    node $helper --agent $agent --label $label
    if ($LASTEXITCODE -ne 0) { throw "Brain integration registration failed" }
  } finally {
    if ($tmpHelper) { Remove-Item -Force $tmpHelper -ErrorAction SilentlyContinue }
  }
}

Write-Host ""
Write-Host "Brain - setup (Windows)" -ForegroundColor White
Write-Host "================================" -ForegroundColor White

# --- 1. Prerequisites: node, git, gh -----------------------------------------
$haveWinget = Have winget
if (-not $haveWinget) {
  Warn "winget (App Installer) was not found on this machine."
  Warn "Install 'App Installer' from the Microsoft Store, then re-run this script."
  Warn "Or install the three tools manually, then re-run:"
  Warn "   Node LTS : https://nodejs.org/en/download"
  Warn "   Git      : https://git-scm.com/downloads/win"
  Warn "   GitHub CLI: https://cli.github.com/"
}

function Ensure($cmd, $wingetId, $url) {
  if (Have $cmd) { Ok "$cmd already installed"; return }
  if ($haveWinget) {
    Say "installing $cmd ..."
    winget install --id $wingetId -e --source winget --accept-package-agreements --accept-source-agreements | Out-Null
    Ok "$cmd installed"
  } else {
    Warn "$cmd is missing - install it from $url and re-run this script."
    throw "missing prerequisite: $cmd"
  }
}

Ensure node OpenJS.NodeJS.LTS "https://nodejs.org/en/download"
Ensure git  Git.Git           "https://git-scm.com/downloads/win"
Ensure gh   GitHub.cli        "https://cli.github.com/"

# Refresh PATH for THIS session so the just-installed exes are usable without reopening.
$machinePath = [Environment]::GetEnvironmentVariable('Path','Machine')
$userPath    = [Environment]::GetEnvironmentVariable('Path','User')
$env:Path = "$machinePath;$userPath"

RegisterAgent "claude" "Claude Code"

# --- 2. Claude Code -----------------------------------------------------------
if (Have claude) {
  Ok "Claude Code already installed"
} else {
  Say "installing Claude Code ..."
  irm https://claude.ai/install.ps1 | iex
  $env:Path = "$machinePath;$userPath;$env:USERPROFILE\.local\bin"
  Ok "Claude Code installed"
}

# --- 3. Sign in to GitHub in the browser (no token to copy) -------------------
# brain-sync falls back to `gh auth token`, so a browser login covers BOTH push and PR.
$alreadyAuthed = $false
try { gh auth status 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $alreadyAuthed = $true } } catch {}
if ($alreadyAuthed) {
  Ok "GitHub sign-in already configured"
} else {
  Say "opening your browser to sign in to GitHub ..."
  gh auth login --hostname github.com --git-protocol https --web
  Ok "signed in to GitHub"
}

# --- Done ---------------------------------------------------------------------
Write-Host ""
Write-Host "Almost there. Open Claude Code and run these two lines:" -ForegroundColor White
Write-Host "    /plugin marketplace add kooropatfa/brain" -ForegroundColor Green
Write-Host "    /plugin install brain@brain" -ForegroundColor Green
Write-Host ""
Write-Host "That's it. Your agent now syncs the Brain at the start of every session." -ForegroundColor White
Write-Host "To save something, just tell it: add this to the brain" -ForegroundColor White
Write-Host ""
