# Changelog

Notable Brain engine changes are collected here. Dates use the local release date.

## 2026-06-25

### Added

- Native Codex adapter under `codex/`, including installer scripts, a Codex skill, and a
  `SessionStart` sync hook for projects bound with `.brains.yml`.
- Multi-agent integration registry at `~/.brain/agent-integrations.json`.
- `tools/agent-integration/register.mjs` for idempotently registering agent adapters.
- Per-agent contribution attribution through `BRAIN_AGENT_TRAILER`; Codex uses
  `Co-Authored-By: OpenAI Codex <codex@openai.com>`.
- Integration guide for future adapters, including Google Anti Gravity guidance and Tractor-style
  parallel review agents.
- Tests for registry behavior and Codex hook idempotence.

### Changed

- Claude Code and Codex can now coexist on the same machine. They share the same engine,
  `brain-sync`, `.brains.yml` project policy, and Brain clones under `~/.brain/<name>`.
- Installers now refresh the same adapter instead of duplicating hooks or skills, and adding a
  second adapter no longer blocks on an existing adapter.
- Public install docs now describe adapter coexistence instead of a one-agent-per-machine model.

### Removed

- Removed the old singleton integration guard based on `~/.brain/agent-integration.json`.

### Notes

- If you installed during the short-lived singleton guard window, the singular
  `~/.brain/agent-integration.json` file is obsolete. Current installers use the plural
  `~/.brain/agent-integrations.json` registry.
