# opencode-subagents-activity

A [OpenCode](https://opencode.ai) V2 TUI plugin: a sidebar block that monitors **subagents
running in the current session** and shows each one's **last activity** time, so you can
tell at a glance whether an agent is working or stuck.

Small TUI plugin built on the official [`@opencode/plugin/tui`](https://opencode.ai/v2/docs/build/plugins/cli/) API.

## What you get

| Where | What |
| --- | --- |
| Sidebar (`sidebar.content`) | A **Subagents** block that lists **only subagents that are actually running** (name on the left, last-activity age on the right). |
| Popup (click a subagent row, or `/subagents`) | A searchable list of **all** subagents of the session — running first, finished below — with a compact summary per row. |

- **The sidebar stays quiet**: finished subagents are not shown. When nothing is running the
  block shows a single muted line (`nothing running · history`) — the history lives in the popup.
- **Header row** (`▼ Subagents (N running)`) — click **anywhere on the row** to collapse or
  expand, exactly like the native `MCP`/`Session` blocks.
- **Staleness dot** per running row:
  - green — activity within the last minute;
  - yellow — 1–5 min since the last step;
  - red — more than 5 min with no new step (likely stuck).
- **One row per subagent session**: a session that was resumed by later calls (`resume` /
  `continue` patterns) appears once — the row takes the latest call's name, and the details
  list every call that touched the session.
- **Click a subagent row** (or the `nothing running · history` placeholder) to open the popup,
  preselected on that subagent.
- **Popup**:
  - `● running` / `○ done` marker plus the subagent's name;
  - a one-line summary: duration · steps/tools (or the tool it is running right now)
    · tokens in/out · cost · outcome (`done`, `failed: content-filter`, …) · last activity;
  - **Enter** (or a click on a row) opens a wide two-column details view — muted labels on
    the left, values on the right, status/error colorized: started/finished times, model,
    token breakdown (input/output/reasoning/cache), cost, step & tool counts with top tools,
    TTFT, finish reason, retries, error text and a reply preview;
  - **Esc** in details returns to the list;
  - **ctrl+o** jumps into the subagent's session;
  - **Esc** (or ctrl+a) in the list closes the popup.
- `/subagents` opens the same popup from anywhere.

## Install

> **TUI plugin** — reactive block in the sidebar. **Cached installs (`npm`, `github:…`)
> freeze reactivity** (the block stops updating, clicks don't respond) due to upstream
> bug [anomalyco/opencode#39986](https://github.com/anomalyco/opencode/issues/39986):
> the loader skips the host transform for cached packages. **The working install is a
> local clone referenced by an absolute path** (the host transform applies).

### Working: git clone + absolute path

```sh
git clone https://github.com/LazyGatto/opencode-subagents-activity.git \
  ~/opencode-plugins/opencode-subagents-activity
```

```jsonc
// ~/.config/opencode/cli.json
{
  "plugins": ["/absolute/path/to/opencode-subagents-activity"]
}
```

Restart the TUI after installing.

### Not for now: npm / `github:` (load, but reactivity is frozen)

```sh
opencode plugin add github:LazyGatto/opencode-subagents-activity
# or npm, once published
```

These install and load the plugin, but interactive updates stay frozen until
[anomalyco/opencode#39986](https://github.com/anomalyco/opencode/issues/39986) is fixed.

Requirements: OpenCode V2; `@opentui/core`, `@opentui/solid`, `solid-js` are peer
dependencies provided by the host.

## How it works

Subagents are spawned through the `subagent` tool call in the parent session. The plugin
reads those tool calls, gets each subagent's `sessionID`, and reads that session's last
activity timestamp. The subagent is considered "running" when its own session status is
`running` (the tool call itself may already be `completed` for background subagents).

## License

MIT
