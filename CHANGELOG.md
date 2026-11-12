# Changelog

## 0.1.0 — 2026-11-12

- Sidebar `Subagents` block: lists running subagents with last-activity age.
- Collapsible (like the native MCP block); collapsed shows `(N running)`.
- Staleness dots: green (<1 min), yellow (1–5 min), red (>5 min without new steps).
- Click a row to open that subagent's session.
- Detects subagents via the `subagent` tool call and uses the subagent session's own
  status for the running check (background subagents may have a completed tool call).
