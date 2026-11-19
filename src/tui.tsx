/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, For, onMount, Show } from "solid-js"

// opencode-subagents-activity: monitors subagents spawned in the current session.
// The sidebar stays quiet: only subagents that are actually working are listed.
// Click "Subagents" to open a popup (like session-time's /time) with the full
// history — running first, finished below, each with a compact summary (duration,
// steps/tools, current tool, tokens, cost, outcome). Enter (or a click) opens full
// details (TTFT, cache, tool breakdown, finish/error); Esc returns to the list;
// ctrl+o jumps into the subagent session. Slash command: /subagents.

const ago = (ms: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const clock = (ms?: number) => {
  if (!ms) return "—"
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  if (d.toDateString() === new Date().toDateString()) return time
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}, ${time}`
}

const durMs = (ms: number) => {
  if (!(ms > 0)) return "—"
  if (ms < 1000) return `${Math.floor(ms)}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`
  const h = Math.floor(m / 60)
  return `${h}h${String(m % 60).padStart(2, "0")}m`
}

// 1234 → 1.2k, 45200 → 45k, 1200000 → 1.2M
const num = (n: number) => {
  if (!n) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (n >= 100_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`
  return String(n)
}

const clip = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

type Sub = {
  sessionID: string
  name: string
  status: string
}

const subagentsIn = (list: any[]): Sub[] => {
  const out: Sub[] = []
  for (const message of list) {
    for (const part of message.content ?? []) {
      if (part.type !== "tool" || (part.name !== "subagent" && part.name !== "task")) continue
      const meta = part.state?.metadata ?? {}
      const input = (part.state?.input ?? {}) as Record<string, unknown>
      const sessionID = meta.sessionID ?? meta.sessionId ?? meta.childID ?? input.sessionID
      if (!sessionID) continue
      const agent =
        typeof input.agent === "string" ? input.agent : typeof input.subagent_type === "string" ? input.subagent_type : undefined
      const description = typeof input.description === "string" ? input.description : undefined
      const name = [agent, description].filter(Boolean).join(": ") || "Subagent"
      out.push({ sessionID: String(sessionID), name, status: String(part.state?.status ?? "") })
    }
  }
  return out
}

type Row = {
  sessionID: string
  name: string
  running: boolean
  // how many subagent calls reused this session (resume/continue)
  calls: number
  // distinct names of those calls, oldest → newest
  names: string[]
  // timeline
  created?: number
  updated?: number
  last: number
  durationMs?: number
  // work done
  steps: number
  tools: number
  toolCounts: Record<string, number>
  current?: { name: string; since: number }
  // usage
  tokensIn: number
  tokensOut: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  // outcome
  outcome?: string
  finish?: string
  error?: string
  retries: number
  ttft?: number
  model?: string
  reply?: string
}

export default Plugin.define({
  id: "subagents-activity",
  setup(context) {
    const [tick, setTick] = createSignal(0)
    const bump = () => setTick((t) => t + 1)
    const [view, updateView] = context.storage.store("subagents-view", { initial: { open: true } })
    const toggle = () => {
      void updateView((draft) => {
        draft.open = !draft.open
      }).catch(() => {})
    }

    const messages = (sessionID: string) => (context.data.session.message.list(sessionID) ?? []) as any[]

    // Keep subagent session data fresh so stats and last-activity times are live.
    const syncSubs = () => {
      const route = context.ui.router.current()
      const sid = route.type === "session" ? route.sessionID : undefined
      if (!sid) return
      for (const sub of subagentsIn(messages(sid))) {
        void context.data.session.sync(sub.sessionID).catch(() => {})
        void context.data.session.message.sync(sub.sessionID).catch(() => {})
      }
    }

    const unlisten = context.data.listen(() => {
      syncSubs()
      bump()
    })
    const timer = setInterval(() => {
      syncSubs()
      bump()
    }, 5_000)

    const openSub = (sessionID: string) => {
      context.ui.router.navigate({ type: "session", sessionID })
    }

    const collect = (sub: Sub, calls: number, names: string[]): Row => {
      const sid = sub.sessionID
      const list = messages(sid)
      const info = context.data.session.get(sid) as any
      let last = 0
      let steps = 0
      let tools = 0
      let firstAssistant: any
      let finish: string | undefined
      let error: string | undefined
      let retries = 0
      let reply: string | undefined
      let current: { name: string; since: number } | undefined
      const toolCounts: Record<string, number> = {}

      for (const m of list) {
        const t = m.time?.completed ?? m.time?.created ?? 0
        if (t > last) last = t
        if (m.type !== "assistant") continue
        steps++
        if (!firstAssistant) firstAssistant = m
        if (m.finish) finish = m.finish
        if (m.error?.message) error = String(m.error.message)
        if (m.retry) retries++
        for (const part of m.content ?? []) {
          if (part.type === "tool") {
            tools++
            toolCounts[part.name] = (toolCounts[part.name] ?? 0) + 1
            if (part.state?.status === "running" || part.state?.status === "streaming") {
              current = { name: part.name, since: part.time?.ran ?? part.time?.created ?? 0 }
            } else if (part.state?.status === "error" && part.state?.error?.message) {
              error = String(part.state.error.message)
            }
          }
          if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
            reply = part.text
          }
        }
      }

      const tokens = info?.tokens ?? {}
      const created = info?.time?.created ?? firstAssistant?.time?.created
      const updated = info?.time?.updated ?? last
      const running = sub.status === "running" || sub.status === "streaming" || context.data.session.status(sid) === "running"
      const end = running ? Date.now() : updated
      const model = info?.model
        ? `${info.model.providerID}/${info.model.model}${info.model.variant ? `#${info.model.variant}` : ""}`
        : undefined

      return {
        sessionID: sid,
        name: sub.name ?? info?.title ?? "Subagent",
        running,
        calls,
        names,
        created,
        updated,
        last,
        durationMs: created && end ? end - created : undefined,
        steps,
        tools,
        toolCounts,
        current,
        tokensIn: tokens.input ?? 0,
        tokensOut: tokens.output ?? 0,
        reasoning: tokens.reasoning ?? 0,
        cacheRead: tokens.cache?.read ?? 0,
        cacheWrite: tokens.cache?.write ?? 0,
        cost: typeof info?.cost === "number" ? info.cost : 0,
        outcome: info?.outcome,
        finish,
        error,
        retries,
        ttft: firstAssistant?.time?.firstToken
          ? firstAssistant.time.firstToken - firstAssistant.time.created
          : undefined,
        model,
        reply,
      }
    }

    // Every subagent of the session: live stats, running first, newest activity first.
    // One row per subagent session: a resumed/continued session (several tool calls
    // sharing one sessionID) must stay a single row — otherwise dialog.select marks
    // both rows at once because they share the same value.
    const rows = createMemo(() => {
      tick()
      const route = context.ui.router.current()
      const sid = route.type === "session" ? (route.sessionID as string) : undefined
      if (!sid) return []
      const subs = subagentsIn(messages(sid))
      const counts = new Map<string, number>()
      const names = new Map<string, string[]>()
      const uniq = new Map<string, Sub>()
      for (const sub of subs) {
        counts.set(sub.sessionID, (counts.get(sub.sessionID) ?? 0) + 1)
        const list = names.get(sub.sessionID) ?? []
        if (!list.includes(sub.name)) list.push(sub.name)
        names.set(sub.sessionID, list)
        uniq.set(sub.sessionID, sub) // last call wins: it carries the freshest name
      }
      const collected = [...uniq.values()].map((sub) =>
        collect(sub, counts.get(sub.sessionID) ?? 1, names.get(sub.sessionID) ?? [sub.name]),
      )
      collected.sort((a, b) => Number(b.running) - Number(a.running) || (b.last || 0) - (a.last || 0))
      return collected
    })

    const dot = (last: number) => {
      const age = Date.now() - last
      if (!last || age > 5 * 60_000) return context.theme.text.feedback.error.base
      if (age > 60_000) return context.theme.text.feedback.warning.base
      return context.theme.text.feedback.success.base
    }

    const outcomeOf = (row: Row) => {
      if (row.running) {
        const age = row.current?.since ? durMs(Date.now() - row.current.since) : undefined
        return row.current ? `running: ${row.current.name}${age ? ` ${age}` : ""}` : "running"
      }
      if (row.error) return `failed: ${clip(row.error, 40)}`
      if (row.finish === "content-filter") return "failed: content-filter"
      if (row.finish === "error") return "failed"
      if (row.outcome) return row.outcome
      return "done"
    }

    // Compact one-liner: duration · steps/tools (or current tool) · tokens · cost · outcome · age
    const money = (cents: number) => `$${cents >= 0.01 ? cents.toFixed(3) : cents.toFixed(4)}`

    const summaryOf = (row: Row) => {
      const parts: string[] = []
      if (row.durationMs) parts.push(durMs(row.durationMs))
      if (row.running) {
        parts.push(`step ${row.steps}`)
        if (row.current) {
          const age = row.current.since ? durMs(Date.now() - row.current.since) : ""
          parts.push(`${row.current.name}${age ? ` ${age}` : ""}`)
        }
      } else {
        parts.push(`${row.steps} steps${row.tools ? `/${row.tools} tools` : ""}`)
      }
      parts.push(`${num(row.tokensIn)} in/${num(row.tokensOut)} out`)
      if (row.cost > 0) parts.push(money(row.cost))
      parts.push(outcomeOf(row))
      if (row.last) parts.push(`last ${ago(row.last)}`)
      return parts.join(" · ")
    }

    // Details: two columns — muted key, bright value — instead of a plain text blob.
    const detailItems = (row: Row) => {
      const theme = context.theme
      const failed = row.finish === "content-filter" || row.finish === "error" || row.outcome === "failed" || !!row.error
      const items: Array<{ label: string; value: string; color?: string }> = [
        {
          label: "status",
          value: outcomeOf(row),
          color: row.running
            ? theme.text.feedback.success.base
            : failed
              ? theme.text.feedback.error.base
              : theme.text.feedback.success.base,
        },
        { label: "title", value: row.name },
      ]
      if (row.calls > 1) items.push({ label: "calls", value: `${row.calls} · ${row.names.join(" → ")}` })
      items.push(
        { label: "started", value: clock(row.created) },
        { label: "duration", value: row.durationMs ? durMs(row.durationMs) : "—" },
        { label: "last", value: row.last ? `${ago(row.last)} (${clock(row.last)})` : "—" },
      )
      if (row.model) items.push({ label: "model", value: row.model })
      items.push({
        label: "tokens",
        value: `in ${num(row.tokensIn)} · out ${num(row.tokensOut)}${row.reasoning ? ` · reasoning ${num(row.reasoning)}` : ""}`,
      })
      if (row.cacheRead || row.cacheWrite) {
        items.push({ label: "cache", value: `read ${num(row.cacheRead)} · write ${num(row.cacheWrite)}` })
      }
      items.push(
        { label: "cost", value: row.cost ? money(row.cost) : "$0" },
        {
          label: "work",
          value: `steps ${row.steps}${row.tools ? ` · tools ${row.tools}` : ""}${row.ttft ? ` · ttft ${durMs(row.ttft)}` : ""}`,
        },
      )
      const toolTop = Object.entries(row.toolCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([n, c]) => `${n} ${c}`)
        .join(", ")
      if (toolTop) items.push({ label: "top tools", value: toolTop })
      if (row.finish) items.push({ label: "finish", value: row.finish })
      if (row.retries) items.push({ label: "retries", value: String(row.retries) })
      if (row.error) items.push({ label: "error", value: clip(row.error, 200), color: theme.text.feedback.error.base })
      if (row.reply) items.push({ label: "reply", value: clip(row.reply, 240), color: theme.text.muted })
      return items
    }

    const DetailsView = (props: { row: Row }) => {
      const theme = context.theme
      return (
        <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
          <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
            <text>
              <b>Subagent details</b>
            </text>
            <text style={{ fg: theme.text.muted }}>esc</text>
          </box>
          <For each={detailItems(props.row)}>
            {(item) => (
              <box flexDirection="row" gap={1} minWidth={0}>
                <box width={11} flexShrink={0}>
                  <text style={{ fg: theme.text.muted }}>{item.label}</text>
                </box>
                <box flexGrow={1} flexShrink={1} minWidth={0}>
                  <text wrapMode="word" style={{ fg: item.color ?? theme.text.base }}>
                    {item.value}
                  </text>
                </box>
              </box>
            )}
          </For>
        </box>
      )
    }

    // Popup (same style as session-time's /time): full history, search, Esc to close.
    // Row (Enter or click) → details; Esc in details returns to the list; ctrl+o opens the session.
    const openPopup = async (current?: string) => {
      if (rows().length === 0) {
        context.ui.toast.show({ message: "No subagents in this session yet" })
        return
      }
      let openFor: string | undefined
      for (;;) {
        const list = rows()
        const selection = context.ui.dialog.select({
          title: `Subagents · ${list.filter((r) => r.running).length} running / ${list.length} total`,
          current,
          options: list.map((r) => ({
            title: `${r.running ? "● running" : "○ done"} · ${r.name}`,
            value: r.sessionID,
            description: summaryOf(r),
          })),
          search: (query: string, options: readonly any[]) =>
            options.filter((o) => `${o.title} ${o.description ?? ""}`.toLowerCase().includes(query.toLowerCase())),
          actions: [
            {
              bind: "ctrl+o",
              title: "Open",
              side: "right",
              selection: "required",
              onTrigger: (value: string) => {
                openFor = value
                context.ui.dialog.clear()
              },
            },
            {
              bind: "ctrl+a",
              title: "Close",
              side: "right",
              selection: "none",
              onTrigger: () => context.ui.dialog.clear(),
            },
          ],
        })
        context.ui.dialog.set({ size: "xlarge", centered: true })
        const picked = await selection
        if (openFor) {
          const sessionID = openFor
          openFor = undefined
          openSub(sessionID)
          return
        }
        if (!picked) return
        const row = rows().find((r) => r.sessionID === picked)
        if (!row) continue
        // Custom dialog: two-column colored details. Esc (modal layer) pops it and calls
        // onClose → we reopen the list, exactly like the alert loop in session-time.
        await new Promise<void>((resolve) => {
          context.ui.dialog.show(() => <DetailsView row={row} />, () => resolve())
          // show() replaces the dialog and resets the size to medium — widen again immediately.
          context.ui.dialog.set({ size: "xlarge", centered: true })
        })
        continue
      }
    }

    const SubagentsActivity = (props: { sessionID: string }) => {
      onMount(() => {
        void context.data.session.message.sync(props.sessionID).catch(() => {})
        syncSubs()
      })
      const live = createMemo(() => rows().filter((r) => r.running))
      const total = createMemo(() => rows().length)
      const theme = context.theme

      return (
        <Show when={total() > 0}>
          <box flexDirection="column">
            <box flexDirection="row" onMouseUp={toggle}>
              <text content={view.open ? "▼ " : "▶ "} />
              <text>
                <b>Subagents</b>
                <span style={{ fg: theme.text.muted }}> ({live().length} running)</span>
              </text>
            </box>

            <Show when={view.open}>
              <Show
                when={live().length > 0}
                fallback={
                  <box flexDirection="row" onMouseUp={() => void openPopup()}>
                    <text wrapMode="none" truncate style={{ fg: theme.text.muted }}>
                      nothing running · history
                    </text>
                  </box>
                }
              >
                <For each={live()}>
                  {(sub) => (
                    <box flexDirection="row" gap={1} minWidth={0} onMouseUp={() => void openPopup(sub.sessionID)}>
                      <text flexShrink={0} style={{ fg: dot(sub.last) }}>
                        ●
                      </text>
                      <text wrapMode="none" truncate flexGrow={1} flexShrink={1} minWidth={0}>
                        <span style={{ fg: theme.text.base }}>{sub.name}</span>
                      </text>
                      <text wrapMode="none" flexShrink={0} style={{ fg: dot(sub.last) }}>
                        {sub.last ? ago(sub.last) : "—"}
                      </text>
                    </box>
                  )}
                </For>
              </Show>
            </Show>
          </box>
        </Show>
      )
    }

    const dispose = context.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => <SubagentsActivity sessionID={sessionID} />,
    })

    // Keymap provider exists only in a full TUI; CLI reconciliation must not fail.
    try {
      context.keymap.layer(() => ({
        mode: "global",
        commands: [
          {
            id: "subagents-activity.all",
            title: "Subagents: show all",
            slash: { name: "subagents" },
            run: () => {
              void openPopup()
            },
          },
        ],
      }))
    } catch {
      // no Keymap.Provider outside the TUI — the command is simply not registered
    }

    return () => {
      clearInterval(timer)
      unlisten()
      dispose?.()
    }
  },
})