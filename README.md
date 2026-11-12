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

> **TUI plugin** — installing from **npm is affected by an upstream bug**
> ([anomalyco/opencode#39986](https://github.com/anomalyco/opencode/issues/39986)):
> the npm cache skips the host transform, which disables reactivity (the
> sidebar block stops updating). npm install is documented only after the
> bug is fixed and the plugin is published.

### 1. `opencode plugin add github:…` (works on current CLI versions)

```sh
opencode plugin add github:LazyGatto/opencode-subagents-activity
```

Restart the TUI after installing.

### 2. Fallback: git clone + absolute path (version-independent)

On some CLI versions the git-dep install step above can fail with
`NpmInstallFailedError: … git dep preparation failed`. If that happens, clone the
repository and reference it by absolute path:

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

Note: listing `"github:…"` directly in `cli.json` triggers the same git-dep install as
`plugin add`, so if that step fails on your CLI version, prefer the absolute path.

Requirements: OpenCode V2; `@opentui/core`, `@opentui/solid`, `solid-js` are peer
dependencies provided by the host.

## How it works

Subagents are spawned through the `subagent` tool call in the parent session. The plugin
reads those tool calls, gets each subagent's `sessionID`, and reads that session's last
activity timestamp. The subagent is considered "running" when its own session status is
`running` (the tool call itself may already be `completed` for background subagents).

## License

MIT
