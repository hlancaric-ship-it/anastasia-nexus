import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Alert, Badge, Button, Container, Heading, Select, StatusBadge, Text, Textarea, toast, usePrompt } from "@medusajs/ui"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"

type Customer = { id: string; name: string | null; email: string | null; chat_blocked: boolean }
type Conversation = {
  id: string
  subject: string | null
  order_id: string | null
  booking_id: string | null
  status: "open" | "closed"
  muted: boolean
  last_message_at: string | null
  unread: boolean
  created_at: string
  customer: Customer
}
type Message = { id: string; author: "customer" | "lucia"; body: string; created_at: string }
type Filter = "open" | "closed" | "all"

const MAX_REPLY = 5000
const POLL_MS = 30_000
const dateFmt = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Bratislava", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })
const fmt = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "—")

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.message || "Spojení se serverem selhalo. Zkuste to prosím znovu.")
  return body as T
}

const customerLabel = (c: Customer) => c.name || c.email || "Zákaznice"

export default function ChatPage() {
  const prompt = usePrompt()
  const [filter, setFilter] = useState<Filter>("open")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [listError, setListError] = useState("")
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ conversation: Conversation; messages: Message[] } | null>(null)
  const [detailError, setDetailError] = useState("")
  const [reply, setReply] = useState("")
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadList = useCallback(async () => {
    try {
      const data = await api<{ conversations: Conversation[]; unread: number }>(`/admin/chat/conversations?status=${filter}&limit=200`)
      setConversations(data.conversations); setUnreadCount(data.unread); setListError("")
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Konverzace se nepodařilo načíst.")
    } finally { setLoadingList(false) }
  }, [filter])

  const loadDetail = useCallback(async (id: string, markRead: boolean) => {
    try {
      const data = await api<{ conversation: Conversation; messages: Message[] }>(`/admin/chat/conversations/${id}`)
      setDetail(data); setDetailError("")
      if (markRead && data.conversation.unread) {
        await api(`/admin/chat/conversations/${id}/read`, { method: "POST", body: "{}" })
        void loadList()
      }
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Konverzaci se nepodařilo načíst.")
    }
  }, [loadList])

  useEffect(() => { setLoadingList(true); void loadList() }, [loadList])
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return
      void loadList()
      if (selectedId) void loadDetail(selectedId, true)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [loadList, loadDetail, selectedId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }) }, [detail?.messages.length])

  function open(id: string) {
    if (id === selectedId) return
    setSelectedId(id); setDetail(null); setReply("")
    void loadDetail(id, true)
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedId || !reply.trim()) return
    setBusy(true)
    try {
      await api(`/admin/chat/conversations/${selectedId}/messages`, { method: "POST", body: JSON.stringify({ body: reply }) })
      setReply("")
      toast.success("Odpověď odeslána. Zákaznice dostane upozornění e-mailem.")
      await Promise.all([loadDetail(selectedId, false), loadList()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Odpověď se nepodařilo odeslat.")
    } finally { setBusy(false) }
  }

  async function act(action: "close" | "reopen" | "mute" | "unmute") {
    if (!detail) return
    if (action === "close") {
      const ok = await prompt({
        title: "Uzavřít konverzaci?",
        description: "Zákaznice do ní už nebude moct psát (může začít novou). Konverzaci můžete kdykoli znovu otevřít.",
        confirmText: "Uzavřít", cancelText: "Zpět",
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      const data = await api<{ conversation: Conversation; messages: Message[] }>(`/admin/chat/conversations/${detail.conversation.id}`, { method: "POST", body: JSON.stringify({ action }) })
      setDetail(data)
      toast.success({ close: "Konverzace uzavřena.", reopen: "Konverzace je znovu otevřená.", mute: "Konverzace ztlumena – nebudou chodit upozornění.", unmute: "Ztlumení zrušeno." }[action])
      await loadList()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Akce se nepovedla.")
    } finally { setBusy(false) }
  }

  async function toggleBlock() {
    if (!detail) return
    const customer = detail.conversation.customer
    const blocked = !customer.chat_blocked
    if (blocked) {
      const ok = await prompt({
        title: `Zablokovat chat pro ${customerLabel(customer)}?`,
        description: "Zákaznice nebude moct posílat žádné zprávy (ani do nových konverzací). Její objednávky a účet se nemění. Blokaci můžete kdykoli zrušit.",
        confirmText: "Zablokovat", cancelText: "Zpět",
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      await api(`/admin/chat/customers/${customer.id}/block`, { method: "POST", body: JSON.stringify({ blocked }) })
      toast.success(blocked ? "Chat zákaznice je zablokovaný." : "Zákaznice může znovu psát.")
      await Promise.all([loadDetail(detail.conversation.id, false), loadList()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Akce se nepovedla.")
    } finally { setBusy(false) }
  }

  const conv = detail?.conversation
  const replyLength = [...reply].length

  return <Container className="flex flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Heading level="h1">Zprávy od zákaznic {unreadCount > 0 && <Badge size="2xsmall" color="blue">{unreadCount} nepřečtené</Badge>}</Heading>
        <Text className="text-ui-fg-subtle">Psát mohou jen zákaznice s objednávkou, rezervací nebo předplatným. Zákaznice pošle nejvýš 3 zprávy po sobě, než odpovíte, a nejvýš 5 zpráv denně.</Text>
      </div>
      <div className="w-48">
        <Select value={filter} onValueChange={(v) => { setFilter(v as Filter); setSelectedId(null); setDetail(null) }}>
          <Select.Trigger><Select.Value /></Select.Trigger>
          <Select.Content>
            <Select.Item value="open">Otevřené</Select.Item>
            <Select.Item value="closed">Uzavřené</Select.Item>
            <Select.Item value="all">Všechny</Select.Item>
          </Select.Content>
        </Select>
      </div>
    </div>

    {listError && <Alert variant="error">{listError}</Alert>}

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,1fr)_2fr]">
      <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto rounded-lg border p-1">
        {loadingList ? <Text className="p-3">Načítám…</Text> : conversations.length === 0
          ? <Text className="p-3 text-ui-fg-subtle">{filter === "closed" ? "Žádné uzavřené konverzace." : "Zatím žádné zprávy."}</Text>
          : conversations.map((c) => <button
            key={c.id}
            type="button"
            onClick={() => open(c.id)}
            className={`flex flex-col gap-0.5 rounded-md px-3 py-2 text-left hover:bg-ui-bg-base-hover ${selectedId === c.id ? "bg-ui-bg-base-pressed" : ""}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={`truncate ${c.unread && !c.muted ? "font-semibold" : ""}`}>{customerLabel(c.customer)}</span>
              <span className="shrink-0 text-xs text-ui-fg-subtle">{fmt(c.last_message_at)}</span>
            </span>
            <span className="flex items-center gap-1 text-xs text-ui-fg-subtle">
              {c.unread && !c.muted && <Badge size="2xsmall" color="blue">Nové</Badge>}
              {c.muted && <Badge size="2xsmall" color="grey">Ztlumeno</Badge>}
              {c.status === "closed" && <Badge size="2xsmall" color="grey">Uzavřeno</Badge>}
              {c.customer.chat_blocked && <Badge size="2xsmall" color="red">Blokováno</Badge>}
              <span className="truncate">{c.subject || "Bez předmětu"}</span>
            </span>
          </button>)}
      </div>

      <div className="flex min-h-[50vh] flex-col gap-3 rounded-lg border p-4">
        {!selectedId ? <Text className="text-ui-fg-subtle">Vyberte konverzaci vlevo.</Text>
          : detailError ? <Alert variant="error">{detailError}</Alert>
          : !conv ? <Text>Načítám…</Text>
          : <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <Text weight="plus">{customerLabel(conv.customer)}{conv.customer.email && conv.customer.name ? ` · ${conv.customer.email}` : ""}</Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {conv.subject || "Bez předmětu"}
                  {conv.order_id && <> · objednávka <a className="text-ui-fg-interactive underline" href={`/app/orders/${encodeURIComponent(conv.order_id)}`}>zobrazit</a></>}
                  {conv.booking_id && <> · k rezervaci</>}
                </Text>
                <div className="flex gap-1">
                  {conv.status === "closed" ? <StatusBadge color="grey">Uzavřeno</StatusBadge> : <StatusBadge color="green">Otevřeno</StatusBadge>}
                  {conv.muted && <StatusBadge color="orange">Ztlumeno</StatusBadge>}
                  {conv.customer.chat_blocked && <StatusBadge color="red">Chat zákaznice blokován</StatusBadge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {conv.status === "open"
                  ? <Button size="small" variant="secondary" disabled={busy} onClick={() => void act("close")}>Uzavřít</Button>
                  : <Button size="small" variant="secondary" disabled={busy} onClick={() => void act("reopen")}>Znovu otevřít</Button>}
                <Button size="small" variant="secondary" disabled={busy} onClick={() => void act(conv.muted ? "unmute" : "mute")}>{conv.muted ? "Zrušit ztlumení" : "Ztlumit"}</Button>
                <Button size="small" variant={conv.customer.chat_blocked ? "secondary" : "danger"} disabled={busy} onClick={() => void toggleBlock()}>
                  {conv.customer.chat_blocked ? "Odblokovat zákaznici" : "Zablokovat zákaznici"}
                </Button>
              </div>
            </div>

            <div className="flex max-h-[50vh] flex-1 flex-col gap-2 overflow-y-auto rounded-md bg-ui-bg-subtle p-3">
              {detail.messages.map((m) => <div key={m.id} className={`flex max-w-[85%] flex-col gap-1 rounded-lg px-3 py-2 ${m.author === "lucia" ? "self-end bg-ui-bg-interactive text-ui-fg-on-color" : "self-start bg-ui-bg-base"}`}>
                {/* Text zprávy jen jako text: React ho escapuje, odkazy se záměrně neaktivují. */}
                <span className="whitespace-pre-wrap break-words text-sm">{m.body}</span>
                <span className="text-xs opacity-70">{m.author === "lucia" ? "Vy" : customerLabel(conv.customer)} · {fmt(m.created_at)}</span>
              </div>)}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={sendReply} className="flex flex-col gap-2">
              <Textarea rows={4} value={reply} disabled={busy} onChange={(e) => setReply(e.target.value)} placeholder="Napište odpověď…" />
              <div className="flex items-center justify-between gap-2">
                <Text size="small" className={replyLength > MAX_REPLY ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
                  {replyLength} / {MAX_REPLY} znaků{conv.status === "closed" ? " · odpověď konverzaci neotevře, zákaznice odpovědět nemůže" : ""}
                </Text>
                <Button type="submit" isLoading={busy} disabled={!reply.trim() || replyLength > MAX_REPLY}>Odeslat odpověď</Button>
              </div>
            </form>
          </>}
      </div>
    </div>
  </Container>
}

export const config = defineRouteConfig({ label: "Zprávy", icon: ChatBubbleLeftRight })
