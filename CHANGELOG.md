# Changelog

## 0.2.0 — 2026-11-19

- **Sidebar lists only running subagents.** Finished ones no longer pile up in the block;
  when nothing is running the block shows a single muted `nothing running · history` line (it opens the popup).
- **One row per subagent session.** Several `subagent` calls that reuse one session
  (resume/continue) used to produce duplicate rows with the same `sessionID`, so the dialog
  highlighted them together and a single row could not be picked. Rows are now deduped by
  session (latest call's name wins; the details list every call's description).
- **Popup with full history** (click a subagent row or `/subagents`): searchable list of all
  subagents of the session — running first, finished below, one row per task.
- **Per-row summary**: duration · steps/tools (or the tool running right now with its elapsed
  time) · tokens in/out · cost · outcome (`done` / `failed: …`) · last activity.
- **Header row** collapses/expands on a click anywhere on the row (session-time/MCP
  pattern); clicking a subagent row opens the popup preselected on it.
- **Enter / click on a row opens full details** as a wide two-column view (muted labels,
  colored values — status green/red, errors red, reply muted): started/last times, model,
  token breakdown (input/output/reasoning/cache read/write), cost, step & tool counts with
  top tools, TTFT, finish reason, retries, error text and a reply preview. Esc in details
  returns to the list.
- **ctrl+o** in the list jumps into the subagent's session.
- New `/subagents` slash command (registered via the keymap layer, TUI only).

## 0.1.0 — 2026-11-12

- Sidebar `Subagents` block: lists running subagents with last-activity age.
- Collapsible (like the native MCP block); collapsed shows `(N running)`.
- Staleness dots: green (<1 min), yellow (1–5 min), red (>5 min without new steps).
- Click a row to open that subagent's session.
- Detects subagents via the `subagent` tool call and uses the subagent session's own
  status for the running check (background subagents may have a completed tool call).
