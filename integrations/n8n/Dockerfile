# n8n on Railway — the meeting-capture START path host.
#
# Pinned image (not :latest) so a Railway redeploy can't silently move n8n versions under the
# imported workflow. Bump deliberately, re-import/re-test the workflow, then commit the new tag.
FROM n8nio/n8n:1.70.0

# n8n listens on $PORT (Railway injects it). The image already EXPOSEs 5678; n8n reads N8N_PORT.
# All real configuration is via environment variables — see .env.example and README.md. Nothing
# secret is baked into the image; Railway provides the env at deploy time.
#
# Persistence: n8n stores workflow state + credentials under /home/node/.n8n. On Railway, attach a
# Volume mounted at /home/node/.n8n so an imported workflow + its GitHub-token credential survive
# redeploys (otherwise you re-import on every deploy). See README "Railway setup" step 4.

USER node
