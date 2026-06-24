# Agent Integration Guide

This repo is the Brain engine. A new model integration should reuse the same knowledge repos,
`brain-sync`, `_inbox/` schema, and ingestion pipeline. Do not fork the Brain storage model per
agent.

## Current Integrations

- Claude Code: installed through the Claude plugin marketplace, with hooks under `hooks/`.
- Codex: installed through `codex/install.*`, with a native Codex skill under `codex/skills/brain`
  and a Codex `SessionStart` hook in `~/.codex/hooks.json`.
- Google Anti Gravity: planned as the Google-side adapter. Do not assume a Gemini CLI path; use the
  integration surface Anti Gravity exposes.

Multiple interactive agent integrations can be installed on the same machine. They all share the
same engine checkout, the same `brain-sync`, the same Brain clones under `~/.brain/<name>`, and the
same per-project `.brains.yml` binding policy.

Installers register adapters in:

```text
~/.brain/agent-integrations.json
```

The minimal registry shape is:

```json
{
  "integrations": {
    "claude": {
      "label": "Claude Code",
      "installed_at": "2026-06-24T00:00:00.000Z",
      "status": "installed"
    },
    "codex": {
      "label": "Codex",
      "installed_at": "2026-06-24T00:00:00.000Z",
      "status": "installed"
    }
  }
}
```

Use `tools/agent-integration/register.mjs` to update it:

```bash
node tools/agent-integration/register.mjs --agent codex --label Codex
```

Re-running the same installer refreshes that integration. Running a different installer adds the
new integration and prints the existing installed adapters; it must not block just because another
agent is already present.

## Starting Google Anti Gravity Work Without Touching This PR

Use a separate git worktree. If Google Anti Gravity work depends on the Codex foundation in PR #6,
branch from the PR branch:

```bash
git -C /Users/m/projects/brain fetch origin
git -C /Users/m/projects/brain worktree add /Users/m/projects/brain-antigravity -b antigravity-integration origin/codex-skill-support
cd /Users/m/projects/brain-antigravity
```

If Google Anti Gravity work should be independent of PR #6, branch from `origin/main` instead:

```bash
git -C /Users/m/projects/brain fetch origin
git -C /Users/m/projects/brain worktree add /Users/m/projects/brain-antigravity -b antigravity-integration origin/main
cd /Users/m/projects/brain-antigravity
```

Rules for the Google Anti Gravity worktree:

- Do not edit `/Users/m/projects/brain` while working in `/Users/m/projects/brain-antigravity`.
- Use a separate branch and PR, for example `antigravity-integration`.
- Keep Google Anti Gravity-specific files under `antigravity/` unless a shared helper is genuinely
  agent-neutral.
- Reuse `tools/brain-sync/brain-sync.mjs`; do not create a Google-specific sync client.
- Reuse `hooks/session-start-sync.mjs` through a thin Anti Gravity hook/extension/task adapter if
  Anti Gravity has a different integration API.
- Do not add instructions that depend on `gemini` being available as a CLI command.
- Reuse `tools/agent-integration/register.mjs` and the
  `~/.brain/agent-integrations.json` registry contract.

## Integration Contract For New Models

Every new agent integration should implement these pieces:

1. Install path

   Provide `agent-name/install.sh` and `agent-name/install.ps1` when possible. The installer should:
   - ensure or check Node, Git, and GitHub CLI;
   - install or link the agent's Brain skill/instructions;
   - register the integration in `~/.brain/agent-integrations.json`;
   - refresh idempotently when the same agent is already registered;
   - continue when another agent is already registered, while showing it as already installed;
   - preserve existing user hooks/config when adding its own hook.

2. Session start sync

   The integration should sync bound Brains at session start. Reuse the existing engine hook logic
   when possible:

   ```bash
   node hooks/session-start-sync.mjs
   ```

   If the agent has a different hook API, create a tiny adapter that calls the engine hook with the
   engine root in environment, like the Codex adapter does.

3. Skill/instruction file

   The model-facing instructions must say:
   - resolve `.brains.yml` before reading or contributing;
   - read the Brain before non-trivial work;
   - write raw captures to `_inbox/`;
   - validate captures before contributing;
   - never merge Brain PRs;
   - use an agent-specific `BRAIN_AGENT_TRAILER`.

4. Contribution attribution

   Set `BRAIN_AGENT_TRAILER` when calling `brain-sync contribute`, for example:

   ```bash
   BRAIN_AGENT_TRAILER="Co-Authored-By: Google Anti Gravity <antigravity@google.com>" \
     node tools/brain-sync/brain-sync.mjs contribute --brain <name> --message "Capture: <title>"
   ```

5. Documentation

   Update all public entry points:
   - root `README.md`;
   - `skills/brain/README.md`;
   - `tools/brain-init/templates/skeleton/README.md`;
   - this guide.

## Test Checklist

- [ ] Existing installer for the same agent is idempotent.
- [ ] Installer for a different agent coexists with existing entries in
      `~/.brain/agent-integrations.json`.
- [ ] Existing hooks/config are preserved.
- [ ] Agent hook installation does not add duplicate session-start hooks.
- [ ] Session-start sync runs in a project with `.brains.yml`.
- [ ] `brain-sync contribute --dry-run` includes the correct agent trailer.
- [ ] Root README and generated Brain README explain the new agent path.

## Tractor / Parallel Agents

Tractor may run Claude, Codex, Google Anti Gravity, or other adapters as parallel review agents. Do
not create per-agent Brain storage. Every review agent should read the same engine repo, the same
`~/.brain/<name>` clone, and the same `.brains.yml` policy for the project under review.

Parallel reads are fine. Writes remain PR-based: if two agents capture knowledge at the same time,
each should use `brain-sync contribute` to create its own branch and PR, and Git/GitHub handles any
conflict during review or merge.
