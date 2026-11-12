# opencode-subagents-activity

A [OpenCode](https://opencode.ai) V2 TUI plugin: a sidebar block that monitors **subagents
running in the current session** and shows each one's **last activity** time, so you can
tell at a glance whether an agent is working or stuck.

Small TUI plugin built on the official [`@opencode/plugin/tui`](https://opencode.ai/v2/docs/build/plugins/cli/) API.

## What you get

| Where | What |
| --- | --- |
| Sidebar (`sidebar.content`) | A **Subagents** block listing running subagents: name on the left, last-activity age on the right (`43s ago`). |

- **Collapsible** (like the built-in `MCP` block): `▶ Subagents (5 running)` collapsed,
  `▼ Subagents last activity` expanded.
- **Staleness dot** per row:
  - green — activity within the last minute;
  - yellow — 1–5 min since the last step;
  - red — more than 5 min with no new step (likely stuck).
- **Click a row** to open that subagent's session.
- The block appears only while at least one subagent is **running**.

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
