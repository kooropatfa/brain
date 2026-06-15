# Contributing

This repo is the Brain **engine** — machinery and skeleton only. PRs are welcome for:

- engine code: `tools/`, `hooks/`, `integrations/`, `.github/workflows/`
- the plugin/skill (`skills/brain/`), docs, the skeleton structure (MOC templates, schema)

Never contribute **knowledge**: no captures, no dimension notes, no real ADRs. Those live in
private Brain instances, not here. A capture or note in a PR to this repo will be rejected.

## Conventions
- Pure zero-dependency Node — every tool runs under bare `node`, no npm install.
- Scalar-only YAML readers (no YAML library) — keep config files flat.
- Conventional commits (`feat:`, `fix:`, `docs:`, …), no emoji in commit messages.
- The inlined n8n Code nodes mirror their `.js` sources — `verify-lockstep.mjs` guards it.

## Tests (all must stay green)
```bash
node tools/classifier/test.mjs
node tools/reviewer/test.mjs
node integrations/n8n/normalize.test.mjs
node integrations/n8n/slack-normalize.test.mjs
node integrations/n8n/verify-lockstep.mjs
node integrations/meet/parse.test.mjs
```

## Fixing the engine
Knowledge repos contain no engine code, so there is nothing to backport — noticed a bug while
using the plugin? Fix it here and send an ordinary PR. (If you have a legacy stamped instance that
predates this split inside your private knowledge repo and a fix originates there, diff the engine
file against this repo and PR the diff — paths match 1:1, no de-branding needed.)
