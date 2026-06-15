# Proactive capture — when to offer, how to offer

The Brain's promise is that **nothing said is ever lost, and no one has to remember to write it down.**
Part of that is the agent noticing a valuable moment and offering to keep it — without becoming a nag.

This whole behavior is gated by config: if `proactive: false`, never offer (only act on command). The
per-session limit is `offer_cap` (default 2). See `configuration.md`.

## What counts as valuable (offer)
- **A decision was made.** "We're switching the pricing model." / "Let's standardize on X." / "Decision's
  made — we drop feature Y." → likely an ADR.
- **A spec emerged.** A feature, flow, interface, or unit got defined concretely enough to build from.
- **A non-obvious insight.** A surprising cause, a hard-won gotcha, a "huh, that's why" — something a
  teammate would be glad not to rediscover.
- **A cross-dimension fact.** Something that ties, say, a `user` behavior to a `product` choice — the
  kind of connection MOCs exist to capture.

## What to suppress (do NOT offer)
- Routine edits, refactors, mechanical work.
- Restating something already written in the repo or already in the Brain (check first if cheap).
- Thinking-aloud, exploration that didn't land, half-formed options you're still weighing.
- Anything the user already declined to capture this session.

## How to offer
- **Once, short, at a natural boundary** (after the decision is settled, not mid-debate). One line:
  > "This looks like a decision worth keeping — want me to add it to the Brain?"
  or "Want me to save this to the Brain so it isn't lost?"
- **Respect `offer_cap`** (default 2) per session. If the user keeps saying no, stop and let them drive.
- **Never re-offer a declined item.**
- **Never contribute without an explicit yes.** Offer → wait → on yes, run the on-command flow.
- **Default to the user's framing.** If they accept, capture what was actually said (verbatim body),
  don't editorialize — the classifier distils, not you.

## The test, in one line
> Would a teammate be worse off in three months for not having this written down? If yes, offer. If it's
> routine, already-recorded, or unsettled, stay quiet.
