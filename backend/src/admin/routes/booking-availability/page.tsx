import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Calendar } from "@medusajs/icons"
import { Alert, Button, Container, Heading, IconButton, Input, StatusBadge, Text, toast, usePrompt } from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useState } from "react"

const TZ = "Europe/Bratislava"
const DAY_NAMES = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"]

type Range = { start_time: string; end_time: string }
type EditableRange = Range & { key: string }
type BookingRow = {
  id: string
  status: "held" | "confirmed"
  paid: boolean
  in_checkout: boolean
  starts_at: string
  ends_at: string
  held_until: string | null
  customer: { name: string; email: string | null }
  product: { title: string }
}
type WeekView = { week_start: string; days: { date: string; ranges: Range[] }[]; bookings: BookingRow[] }
type ApiError = Error & { status?: number; body?: any }

let keySeq = 0
const withKey = (r: Range): EditableRange => ({ ...r, key: `r${++keySeq}` })

/** Kalendářní posun data YYYY-MM-DD (jen navigace v UI; týden normalizuje server). */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}
const localDateOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
const timeOf = (iso: string) => new Intl.DateTimeFormat("cs-CZ", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
function dayLabel(date: string): string {
  const [, m, d] = date.split("-")
  return `${Number(d)}. ${Number(m)}.`
}
function nextRange(ranges: EditableRange[]): Range {
  const last = ranges[ranges.length - 1]
  if (!last || !/^\d{2}:\d{2}$/.test(last.end_time)) return { start_time: "09:00", end_time: "12:00" }
  const [h, m] = last.end_time.split(":").map(Number)
  const end = Math.min(h * 60 + m + 180, 23 * 60 + 55)
  const pad = (n: number) => String(n).padStart(2, "0")
  return { start_time: last.end_time, end_time: `${pad(Math.floor(end / 60))}:${pad(end % 60)}` }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body?.message || "Spojení se serverem selhalo. Zkuste to prosím znovu.") as ApiError
    error.status = response.status
    error.body = body
    throw error
  }
  return body as T
}

function bookingBadge(b: BookingRow) {
  if (b.paid) return <StatusBadge color="green">Zaplaceno</StatusBadge>
  if (b.in_checkout) return <StatusBadge color="orange">Čeká na platbu</StatusBadge>
  return <StatusBadge color="blue">{b.held_until ? `Drží se do ${timeOf(b.held_until)}` : "Rezervováno"}</StatusBadge>
}

function BookingLine({ b }: { b: BookingRow }) {
  return <div className="flex flex-col gap-1 rounded-md border bg-ui-bg-subtle p-2">
    <Text size="small" weight="plus">{timeOf(b.starts_at)}–{timeOf(b.ends_at)}</Text>
    <Text size="small">{b.customer.name}</Text>
    <Text size="small" className="text-ui-fg-subtle">{b.product.title}</Text>
    <div>{bookingBadge(b)}</div>
  </div>
}

export default function BookingAvailabilityPage() {
  const prompt = usePrompt()
  const [view, setView] = useState<WeekView | null>(null)
  const [days, setDays] = useState<Record<string, EditableRange[]>>({})
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [conflicts, setConflicts] = useState<BookingRow[]>([])

  const applyView = useCallback((data: WeekView) => {
    setView(data)
    setDays(Object.fromEntries(data.days.map((d) => [d.date, d.ranges.map(withKey)])))
    setDirty(false); setSaveErrors([]); setConflicts([])
  }, [])

  const load = useCallback(async (date: string) => {
    setLoading(true); setLoadError("")
    try {
      applyView(await request<WeekView>(`/admin/booking/availability?week_start=${encodeURIComponent(date)}`))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Volné termíny se nepodařilo načíst.")
    } finally { setLoading(false) }
  }, [applyView])
  useEffect(() => { void load(todayLocal()) }, [load])

  async function confirmDiscard(): Promise<boolean> {
    if (!dirty) return true
    return prompt({
      title: "Neuložené změny",
      description: "V tomto týdnu máte neuložené změny. Opravdu chcete odejít bez uložení?",
      confirmText: "Zahodit změny",
      cancelText: "Zůstat",
    })
  }
  async function goTo(date: string) {
    if (await confirmDiscard()) await load(date)
  }

  function update(date: string, next: EditableRange[]) {
    setDays((prev) => ({ ...prev, [date]: next }))
    setDirty(true); setSaveErrors([]); setConflicts([])
  }

  async function copyPreviousWeek() {
    if (!view) return
    const hasAny = Object.values(days).some((r) => r.length > 0)
    if (hasAny && !(await prompt({
      title: "Přepsat tento týden?",
      description: "Časy z minulého týdne nahradí to, co je v tomto týdnu vyplněné. Nic se neuloží, dokud nekliknete na „Uložit týden“.",
      confirmText: "Vložit minulý týden",
      cancelText: "Zpět",
    }))) return
    try {
      const previous = await request<WeekView>(`/admin/booking/availability?week_start=${shiftDate(view.week_start, -7)}`)
      const dates = view.days.map((d) => d.date)
      const copied = Object.fromEntries(dates.map((date, i) => [date, (previous.days[i]?.ranges ?? []).map(withKey)]))
      setDays(copied); setDirty(true); setSaveErrors([]); setConflicts([])
      const count = previous.days.reduce((n, d) => n + d.ranges.length, 0)
      if (count === 0) toast.info("Minulý týden nemá vyplněné žádné časy.")
      else toast.info("Časy z minulého týdne jsou vložené. Zkontrolujte je a klikněte na „Uložit týden“.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Minulý týden se nepodařilo načíst.")
    }
  }

  async function save() {
    if (!view) return
    setSaving(true); setSaveErrors([]); setConflicts([])
    try {
      const payload = {
        week_start: view.week_start,
        days: view.days.map((d) => ({ date: d.date, ranges: (days[d.date] ?? []).map(({ start_time, end_time }) => ({ start_time, end_time })) })),
      }
      applyView(await request<WeekView>("/admin/booking/availability", { method: "POST", body: JSON.stringify(payload) }))
      toast.success("Volné termíny jsou uložené. Zákaznice je hned uvidí na webu.")
    } catch (e) {
      const err = e as ApiError
      if (err.status === 409 && err.body?.type === "availability_conflict") {
        setConflicts(err.body.conflicts ?? [])
        setSaveErrors([err.message])
      } else if (err.status === 400 && Array.isArray(err.body?.errors)) {
        setSaveErrors(err.body.errors)
      } else {
        setSaveErrors([err.message || "Uložení se nepovedlo."])
      }
    } finally { setSaving(false) }
  }

  const bookingsByDay = useMemo(() => {
    const map: Record<string, BookingRow[]> = {}
    for (const b of view?.bookings ?? []) (map[localDateOf(b.starts_at)] ??= []).push(b)
    return map
  }, [view])

  const today = todayLocal()
  const weekLabel = view ? `${dayLabel(view.days[0].date)} – ${dayLabel(view.days[6].date)} ${view.days[6].date.slice(0, 4)}` : ""

  return <Container className="flex flex-col gap-6">
    <div className="flex flex-col gap-1">
      <Heading level="h1">Volné termíny</Heading>
      <Text className="text-ui-fg-subtle">Na každý týden vyplňte, kdy máte čas na konzultace. Časy platí pro všechny typy konzultací; web z nich sám nabídne termíny podle délky zvoleného typu. Den bez vyplněného času je zavřený.</Text>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="small" disabled={!view || loading || saving} onClick={() => view && void goTo(shiftDate(view.week_start, -7))}>← Předchozí týden</Button>
      <Button variant="secondary" size="small" disabled={loading || saving} onClick={() => void goTo(today)}>Tento týden</Button>
      <Button variant="secondary" size="small" disabled={!view || loading || saving} onClick={() => view && void goTo(shiftDate(view.week_start, 7))}>Další týden →</Button>
      <Text weight="plus" className="ml-2">{weekLabel}</Text>
    </div>

    {loadError && <Alert variant="error">{loadError}</Alert>}

    {view && !loading && <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
        {view.days.map((d, i) => {
          const ranges = days[d.date] ?? []
          const dayBookings = bookingsByDay[d.date] ?? []
          return <section key={d.date} aria-label={`${DAY_NAMES[i]} ${dayLabel(d.date)}`}
            className={`flex flex-col gap-2 rounded-lg border p-3 ${d.date === today ? "border-ui-border-interactive" : ""}`}>
            <div className="flex items-baseline justify-between">
              <Text weight="plus">{DAY_NAMES[i]}</Text>
              <Text size="small" className="text-ui-fg-subtle">{dayLabel(d.date)}</Text>
            </div>
            {ranges.length === 0 && <Text size="small" className="text-ui-fg-muted">Zavřeno</Text>}
            {ranges.map((r, idx) => <div key={r.key} className="flex items-center gap-1">
              <Input type="time" step={300} size="small" aria-label="Od" value={r.start_time}
                onChange={(e) => update(d.date, ranges.map((x, j) => j === idx ? { ...x, start_time: e.target.value } : x))} />
              <span aria-hidden>–</span>
              <Input type="time" step={300} size="small" aria-label="Do" value={r.end_time}
                onChange={(e) => update(d.date, ranges.map((x, j) => j === idx ? { ...x, end_time: e.target.value } : x))} />
              <IconButton size="small" variant="transparent" aria-label="Odebrat úsek" title="Odebrat úsek"
                onClick={() => update(d.date, ranges.filter((_, j) => j !== idx))}>×</IconButton>
            </div>)}
            <Button size="small" variant="transparent" className="self-start" onClick={() => update(d.date, [...ranges, withKey(nextRange(ranges))])}>+ Přidat čas</Button>
            {dayBookings.length > 0 && <div className="mt-1 flex flex-col gap-2 border-t pt-2">
              <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">Obsazeno</Text>
              {dayBookings.map((b) => <BookingLine key={b.id} b={b} />)}
            </div>}
          </section>
        })}
      </div>

      {saveErrors.length > 0 && <Alert variant="error">
        <div className="flex flex-col gap-2">
          {saveErrors.map((m, i) => <span key={i}>{m}</span>)}
          {conflicts.length > 0 && <>
            <span>Týká se těchto rezervací (obsazený čas musí zůstat ve volném úseku):</span>
            <ul className="list-disc pl-5">
              {conflicts.map((b) => <li key={b.id}>
                {DAY_NAMES[(new Date(`${localDateOf(b.starts_at)}T12:00:00Z`).getUTCDay() + 6) % 7]} {dayLabel(localDateOf(b.starts_at))} {timeOf(b.starts_at)}–{timeOf(b.ends_at)}: {b.customer.name}, {b.product.title}{b.paid ? " (zaplaceno)" : ""}
              </li>)}
            </ul>
            <span>Úsek s rezervací ponechte, nebo rezervaci nejdřív zrušte či přesuňte.</span>
          </>}
        </div>
      </Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void save()} isLoading={saving} disabled={!dirty}>Uložit týden</Button>
        <Button variant="secondary" onClick={() => void copyPreviousWeek()} disabled={saving}>Zkopírovat minulý týden</Button>
        {dirty && <Text size="small" className="text-ui-fg-subtle">Máte neuložené změny.</Text>}
      </div>
    </>}
    {loading && <Text>Načítám…</Text>}
  </Container>
}

export const config = defineRouteConfig({ label: "Volné termíny", icon: Calendar })
