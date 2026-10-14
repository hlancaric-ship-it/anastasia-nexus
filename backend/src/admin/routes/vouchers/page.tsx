import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Switch, Table, Text } from "@medusajs/ui"
import { useCallback, useEffect, useState, type FormEvent } from "react"

type Settings = {
  enabled: boolean
  values: number[]
  validity_months: number
  scope_type: "all" | "categories"
  category_ids: string[]
  partial_redemption: boolean
  delivery_method: "recipient_email" | "buyer_pdf" | "both"
}
type Voucher = {
  id: string; code: string; initial_amount: number; balance: number; status: "active" | "depleted" | "expired" | "void"
  issued_at: string; expires_at: string; source_order_id: string | null; delivery_status: string; delivery_date: string | null
}
type Category = { id: string; name: string }

const FIELD_ERRORS: Record<string, string> = {
  values: "Hodnoty: 1 až 10 rôznych súm od 1 do 10 000 € (najviac 2 desatinné miesta).",
  validity_months: "Platnosť: celé číslo 1 až 60 mesiacov.",
  scope_type: "Vyberte, na čo sa poukaz dá použiť.",
  category_ids: "Pri obmedzení na kategórie vyberte aspoň jednu kategóriu.",
  partial_redemption: "Vyberte, či sa poukaz dá čerpať postupne.",
  delivery_method: "Vyberte spôsob doručenia.",
}
const STATUS: Record<Voucher["status"], { label: string; color: "green" | "grey" | "orange" | "red" }> = {
  active: { label: "Aktívny", color: "green" },
  depleted: { label: "Vyčerpaný", color: "grey" },
  expired: { label: "Expirovaný", color: "orange" },
  void: { label: "Zneplatnený", color: "red" },
}
const DELIVERY: Record<string, string> = { pending: "Čaká", scheduled: "Naplánované", sent: "Odoslané", failed: "Zlyhalo" }
const eur = (value: number) => new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(value)
const date = (value: string) => new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava" }).format(new Date(value))
const PAGE = 50

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const fields = Array.isArray(body.errors) ? body.errors.map((key: string) => FIELD_ERRORS[key] ?? key).join(" ") : ""
    throw new Error(fields || body.message || "Spojenie so serverom zlyhalo.")
  }
  return body as T
}

function SettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [values, setValues] = useState("")
  const [categories, setCategories] = useState<Category[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    api<{ settings: Settings }>("/admin/vouchers/settings")
      .then(({ settings }) => { setSettings(settings); setValues(settings.values.join(", ")) })
      .catch((e) => setError(e.message))
    api<{ product_categories: Category[] }>("/admin/product-categories?limit=500&fields=id,name")
      .then(({ product_categories }) => setCategories(product_categories ?? []))
      .catch(() => setCategories([]))
  }, [])

  if (!settings) return <Text>{error || "Načítavam nastavenie…"}</Text>
  const update = (patch: Partial<Settings>) => { setSettings({ ...settings, ...patch }); setMessage(""); setError("") }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage(""); setError("")
    try {
      const parsed = values.split(/[;,\s]+/).map((v) => v.trim()).filter(Boolean)
      const body = { ...settings!, values: parsed }
      const { settings: saved } = await api<{ settings: Settings }>("/admin/vouchers/settings", { method: "POST", body: JSON.stringify(body) })
      setSettings(saved); setValues(saved.values.join(", "))
      setMessage("Nastavenie je uložené. Produkt „Darčekový poukaz“ má varianty podľa hodnôt. Už predané poukazy si ponechávajú pôvodné pravidlá.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uloženie zlyhalo.")
    } finally { setBusy(false) }
  }

  return <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4" aria-busy={busy}>
    <fieldset disabled={busy} className="flex flex-col gap-4">
      <div className="flex items-center gap-3"><Switch id="enabled" checked={settings.enabled} onCheckedChange={(enabled) => update({ enabled })} /><Label htmlFor="enabled">Predaj poukazov zapnutý</Label></div>
      <div><Label htmlFor="values">Hodnoty poukazu v € (oddelené čiarkou)</Label><Input id="values" value={values} onChange={(e) => { setValues(e.target.value); setMessage("") }} placeholder="50, 100, 200" required /></div>
      <div><Label htmlFor="validity">Platnosť (mesiace od nákupu)</Label><Input id="validity" type="number" min={1} max={60} step={1} value={settings.validity_months} onChange={(e) => update({ validity_months: Number(e.target.value) })} required /></div>
      <div><Label htmlFor="scope">Na čo sa dá poukaz použiť</Label>
        <select id="scope" className="ml-3 min-h-11 rounded border p-2 text-ui-fg-base bg-ui-bg-base" value={settings.scope_type} onChange={(e) => update({ scope_type: e.target.value as Settings["scope_type"] })}>
          <option value="all">Celý e-shop vrátane dopravy</option><option value="categories">Len vybrané kategórie (bez dopravy)</option>
        </select></div>
      {settings.scope_type === "categories" && <fieldset className="flex max-h-64 flex-col gap-1 overflow-auto rounded border p-3"><legend className="px-1 text-ui-fg-subtle">Kategórie</legend>
        {categories.length === 0 && <Text>Žiadne kategórie.</Text>}
        {categories.map((category) => <label key={category.id} className="flex items-center gap-2 min-h-8">
          <input type="checkbox" checked={settings.category_ids.includes(category.id)} onChange={(e) => update({ category_ids: e.target.checked ? [...settings.category_ids, category.id] : settings.category_ids.filter((id) => id !== category.id) })} />
          {category.name}</label>)}
      </fieldset>}
      <div className="flex items-center gap-3"><Switch id="partial" checked={settings.partial_redemption} onCheckedChange={(partial_redemption) => update({ partial_redemption })} />
        <Label htmlFor="partial">Postupné čerpanie (zvyšok zostáva na poukaze). Vypnuté = jednorazové, nevyužitý zvyšok prepadá.</Label></div>
      <div><Label htmlFor="delivery">Doručenie poukazu</Label>
        <select id="delivery" className="ml-3 min-h-11 rounded border p-2 text-ui-fg-base bg-ui-bg-base" value={settings.delivery_method} onChange={(e) => update({ delivery_method: e.target.value as Settings["delivery_method"] })}>
          <option value="both">E-mail obdarovanému v zvolený deň + PDF kupujúcemu</option>
          <option value="recipient_email">Len e-mail obdarovanému v zvolený deň</option>
          <option value="buyer_pdf">Len PDF kupujúcemu (odovzdá sám)</option>
        </select></div>
      <Button type="submit" isLoading={busy} className="self-start">Uložiť nastavenie</Button>
    </fieldset>
    {message && <Text role="status">{message}</Text>}
    {error && <Text role="alert" className="text-ui-fg-error">{error}</Text>}
  </form>
}

function VoucherList() {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [count, setCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState("")

  const load = useCallback(async () => {
    setError("")
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
      if (status) params.set("status", status)
      const body = await api<{ vouchers: Voucher[]; count: number }>(`/admin/vouchers?${params}`)
      setVouchers(body.vouchers); setCount(body.count)
    } catch (e) { setError(e instanceof Error ? e.message : "Načítanie zlyhalo.") }
  }, [offset, status])
  useEffect(() => { void load() }, [load])

  async function voidVoucher(voucher: Voucher) {
    const reason = window.prompt(`Zneplatniť poukaz ${voucher.code} (zostatok ${eur(voucher.balance)})? Uveďte dôvod:`)
    if (!reason?.trim()) return
    setBusyId(voucher.id); setError("")
    try {
      await api(`/admin/vouchers/${voucher.id}/void`, { method: "POST", body: JSON.stringify({ reason }) })
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : "Zneplatnenie zlyhalo.") } finally { setBusyId("") }
  }

  return <div className="flex flex-col gap-3">
    <div><Label htmlFor="status-filter">Stav</Label>
      <select id="status-filter" className="ml-3 min-h-11 rounded border p-2 text-ui-fg-base bg-ui-bg-base" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }}>
        <option value="">Všetky</option>{Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
      </select></div>
    {error && <Text role="alert" className="text-ui-fg-error">{error}</Text>}
    {vouchers.length === 0 && !error && <Text>Zatiaľ žiadne poukazy.</Text>}
    <div className="overflow-x-auto"><Table>
      <Table.Header><Table.Row>
        <Table.HeaderCell>Kód</Table.HeaderCell><Table.HeaderCell>Hodnota</Table.HeaderCell><Table.HeaderCell>Zostatok</Table.HeaderCell>
        <Table.HeaderCell>Platí do</Table.HeaderCell><Table.HeaderCell>Stav</Table.HeaderCell><Table.HeaderCell>Doručenie</Table.HeaderCell><Table.HeaderCell>Objednávka</Table.HeaderCell><Table.HeaderCell />
      </Table.Row></Table.Header>
      <Table.Body>
        {vouchers.map((voucher) => <Table.Row key={voucher.id}>
          <Table.Cell className="font-mono">{voucher.code}</Table.Cell>
          <Table.Cell>{eur(voucher.initial_amount)}</Table.Cell>
          <Table.Cell>{eur(voucher.balance)}</Table.Cell>
          <Table.Cell>{date(voucher.expires_at)}</Table.Cell>
          <Table.Cell><Badge color={STATUS[voucher.status]?.color ?? "grey"}>{STATUS[voucher.status]?.label ?? voucher.status}</Badge></Table.Cell>
          <Table.Cell>{DELIVERY[voucher.delivery_status] ?? voucher.delivery_status}{voucher.delivery_date ? ` (${voucher.delivery_date})` : ""}</Table.Cell>
          <Table.Cell>{voucher.source_order_id ? <a className="underline" href={`/app/orders/${voucher.source_order_id}`}>Detail</a> : "–"}</Table.Cell>
          <Table.Cell>{voucher.status !== "void" && <Button size="small" variant="danger" isLoading={busyId === voucher.id} onClick={() => voidVoucher(voucher)}>Zneplatniť</Button>}</Table.Cell>
        </Table.Row>)}
      </Table.Body>
    </Table></div>
    <div className="flex items-center gap-3">
      <Button size="small" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Predchádzajúce</Button>
      <Text>{count ? `${offset + 1}–${Math.min(offset + PAGE, count)} z ${count}` : "0"}</Text>
      <Button size="small" variant="secondary" disabled={offset + PAGE >= count} onClick={() => setOffset(offset + PAGE)}>Ďalšie</Button>
    </div>
  </div>
}

export default function VouchersPage() {
  return <Container className="flex flex-col gap-8">
    <div><Heading level="h1">Darčekové poukazy</Heading>
      <Text>Nastavenie predaja poukazov a prehľad vydaných poukazov. Celý kód poukazu sa v administrácii nezobrazuje.</Text></div>
    <section className="flex flex-col gap-4" aria-labelledby="settings-heading"><Heading level="h2" id="settings-heading">Nastavenie</Heading><SettingsForm /></section>
    <section className="flex flex-col gap-4" aria-labelledby="list-heading"><Heading level="h2" id="list-heading">Vydané poukazy</Heading><VoucherList /></section>
  </Container>
}

export const config = defineRouteConfig({ label: "Darčekové poukazy" })
