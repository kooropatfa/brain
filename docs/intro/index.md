# Brain — intro & speaker notes

Editable source / speaker outline. The shippable artifact is the single-file deck `index.html` (English)
and `index.pl.html` (Polish), in this folder. View it by:

1. **Simplest:** send the `.html` over Slack/email — double-click opens it in any browser, offline. Fully self-contained.
2. For the talk: open it fullscreen; arrow keys / the top pills navigate.

**Progressive disclosure:** every page starts at a **basic** view. Two reveal buttons per page —
**Details ⌄** (everyday) then **Technical ⌄** (engineering). Two clicks per page, max — a non-tech viewer
reads only the top; an engineer drills down.

**One-liner:** A Brain is to a company what `AGENTS.md` is to a repo — but living, organized by dimension,
shared by everyone, continuously fed. One plugin, your knowledge in your own Git repo, fed in one sentence:
"add this to the brain."

---

## The arc (9 pages, each basic → Details → Technical)

1. **The problem** — the company (and our AI) keeps forgetting; every session starts from zero. *Tech:* an LLM is stateless; the fix is a shared, durable, inspectable store = a Git repo of Markdown.
2. **Two halves** (key mental model) — the **knowledge** (your repo) is separate from the **engine** (one installed plugin, zero knowledge inside). 📚 green = knowledge, ⚙️ blue = engine.
3. **Multi-brain, multi-project** — install the plugin once; run N Brains on a machine (work / private / per venture); each project binds its Brain via `.brains.yml`. Diagram: projects → one engine → the matching knowledge repo (generous spacing). *This is the new architecture.*
4. **The flow** — capture → `_inbox/` → pipeline classifies/files → **auto-merge by default** (human merge optional) → every agent pulls it. Diagram with spaced steps.
5. **Feed it** — "add this to the brain" / "wrzuć to do braina". Four ways in (Slack, in-agent, proactive, session-end). *Tech:* contribute pushes only to the project's bound Brain.
6. **Read it** — humans browse (Obsidian/GitHub); agents sync the bound Brain and consult it before non-trivial work.
7. **Why build our own** — no built-in gives a shared, owned, versioned team brain. Comparison table. Layer on top of Claude Code.
8. **Get it** — one install: prerequisites + `gh auth login`, then `/plugin marketplace add kooropatfa/brain` + `/plugin install brain@brain`. brain-init scaffolds, brain-sync connects, `.brains.yml` binds.
9. **The ask** — feed your Brain one thing only you know this week. It auto-merges if clean. End on the one-liner.

## Architecture facts (verified to the engine repo, June 2026)
- Engine = `kooropatfa/brain` (Claude Code plugin, **no knowledge inside**). One install serves N Brains.
- Knowledge lives in **your own** repo, scaffolded by `brain-init`; clone at `~/.brain/<name>`.
- Projects bind their Brain(s) via `.brains.yml` (`use: [name]`); unbound = asked once; bound = strict isolation.
- Two ingestion modes per Brain: **local** (default, no API/CI) or **action** (GitHub Actions).
- **Auto-merge is the default** — a structural reviewer squash-merges clean ingestion PRs; flagged ones escalate to a human. A Brain opts out with `auto_merge: false`. **Human merge is optional.**
- Ingestion takes a moment — never instant.
