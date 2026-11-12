/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, For, onMount, Show } from "solid-js"

// opencode-subagents-activity: a sidebar block that monitors subagents spawned in
// the current session. Shows each subagent's last activity time with a staleness
// dot (green / yellow / red) so you can spot a stuck one at a glance. Click a row
// to jump to that subagent's session.

const ago = (ms: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
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

    const messages = (sessionID: string) =>
      (context.data.session.message.list(sessionID) ?? []) as any[]

    // Keep subagent session data fresh so last-activity times are live.
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

    const SubagentsActivity = (props: { sessionID: string }) => {
      onMount(syncSubs)

      const model = createMemo(() => {
        tick()
        const subs = subagentsIn(messages(props.sessionID))
        const rows = subs.map((sub) => {
          let last = 0
          for (const m of messages(sub.sessionID)) {
            const t = m.time?.completed ?? m.time?.created ?? 0
            if (t > last) last = t
          }
          const running =
            sub.status === "running" ||
            sub.status === "streaming" ||
            context.data.session.status(sub.sessionID) === "running"
          return { ...sub, last, running }
        })
        // Most stale first — stuck subagents float to the top.
        rows.sort((a, b) => (a.last || 0) - (b.last || 0))
        return rows
      })

      const dot = (last: number) => {
        const age = Date.now() - last
        if (!last || age > 5 * 60_000) return context.theme.text.feedback.error.base
        if (age > 60_000) return context.theme.text.feedback.warning.base
        return context.theme.text.feedback.success.base
      }
      const running = () => model().filter((s) => s.running)

      return (
        <Show when={running().length > 0}>
          <box flexDirection="column">
            <box flexDirection="row" onMouseUp={toggle}>
              <text content={view.open ? "▼ " : "▶ "} />
              <text>
                <b>{view.open ? "Subagents last activity" : "Subagents"}</b>
                <Show when={!view.open}>
                  <span style={{ fg: context.theme.text.muted }}> ({running().length} running)</span>
                </Show>
              </text>
            </box>

            <Show when={view.open}>
              <For each={model()}>
                {(sub) => (
                  <box flexDirection="row" gap={1} minWidth={0} onMouseUp={() => openSub(sub.sessionID)}>
                    <text flexShrink={0} style={{ fg: dot(sub.last) }}>
                      ●
                    </text>
                    <text wrapMode="none" truncate flexGrow={1} flexShrink={1} minWidth={0}>
                      <span style={{ fg: context.theme.text.base }}>{sub.name}</span>
                    </text>
                    <text wrapMode="none" flexShrink={0} style={{ fg: dot(sub.last) }}>
                      {sub.last ? ago(sub.last) : "—"}
                    </text>
                  </box>
                )}
              </For>
            </Show>
          </box>
        </Show>
      )
    }

    const dispose = context.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => <SubagentsActivity sessionID={sessionID} />,
    })

    return () => {
      clearInterval(timer)
      unlisten()
      dispose?.()
    }
  },
})
