import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Tag } from "@medusajs/icons"
import {
  Alert, Badge, Button, Container, Drawer, Heading, Input, Label, Select, StatusBadge, Switch, Table, Text, Textarea, toast, usePrompt,
} from "@medusajs/ui"
import { useCallback, useEffect, useState, type FormEvent } from "react"

type ConsultationType = {
  id: string
  title: string
  description: string
  active: boolean
  archived: boolean
  duration_minutes: number
  buffer_minutes: number
  form: "online" | "in_person"
  price_eur: number | null
}

type FormState = {
  title: string
  description: string
  duration_minutes: string
  buffer_minutes: string
  price_eur: string
  form: "online" | "in_person"
  active: boolean
}

const EMPTY_FORM: FormState = { title: "", description: "", duration_minutes: "60", buffer_minutes: "15", price_eur: "", form: "online", active: true }
const FORM_LABEL = { online: "Online", in_person: "Osobně" } as const
const priceFmt = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "EUR" })

/** Převod textu z pole na číslo; o platnosti (rozsah, desetinná místa) rozhoduje server. */
function toNumber(value: string): number | string | null {
  const trimmed = value.trim().replace(/\s/g, "").replace(",", ".")
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : trimmed
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.message || "Spojení se serverem selhalo. Zkuste to prosím znovu.")
  return body as T
}

function statusOf(type: ConsultationType) {
  if (type.archived) return <StatusBadge color="grey">Archivováno</StatusBadge>
  if (type.active) return <StatusBadge color="green">Nabízí se</StatusBadge>
  return <StatusBadge color="orange">Skryto</StatusBadge>
}

export default function BookingTypesPage() {
  const prompt = usePrompt()
  const [types, setTypes] = useState<ConsultationType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<ConsultationType | "new" | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const load = useCallback(async () => {
    setLoading(true); setLoadError("")
    try {
      const { types } = await api<{ types: ConsultationType[] }>("/admin/booking/types?include_archived=true")
      setTypes(types)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Typy konzultací se nepodařilo načíst.")
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  function openNew() {
    setForm(EMPTY_FORM); setFormError(""); setEditing("new")
  }
  function openEdit(type: ConsultationType) {
    setForm({
      title: type.title,
      description: type.description,
      duration_minutes: String(type.duration_minutes),
      buffer_minutes: String(type.buffer_minutes),
      price_eur: type.price_eur === null ? "" : String(type.price_eur).replace(".", ","),
      form: type.form,
      active: type.active,
    })
    setFormError(""); setEditing(type)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    setSaving(true); setFormError("")
    const payload = {
      title: form.title,
      description: form.description,
      duration_minutes: toNumber(form.duration_minutes),
      buffer_minutes: toNumber(form.buffer_minutes),
      price_eur: toNumber(form.price_eur),
      form: form.form,
      active: form.active,
    }
    try {
      const path = editing === "new" ? "/admin/booking/types" : `/admin/booking/types/${editing.id}`
      await api(path, { method: "POST", body: JSON.stringify(payload) })
      toast.success(editing === "new" ? "Typ konzultace byl vytvořen." : "Změny byly uloženy.")
      setEditing(null)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Uložení se nepovedlo.")
    } finally { setSaving(false) }
  }

  async function setArchived(type: ConsultationType, archived: boolean) {
    if (archived) {
      const ok = await prompt({
        title: `Archivovat „${type.title}“?`,
        description: "Typ zmizí z nabídky na webu. Už zaplacené a rezervované termíny zůstávají platné. Archivaci můžete kdykoli vrátit.",
        confirmText: "Archivovat",
        cancelText: "Zpět",
      })
      if (!ok) return
    }
    try {
      await api(`/admin/booking/types/${type.id}`, { method: "POST", body: JSON.stringify({ archived }) })
      toast.success(archived ? "Typ byl archivován." : "Typ byl obnoven jako skrytý. Zapněte „Nabízet na webu“, až bude připraven.")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Akce se nepovedla.")
    }
  }

  const visible = types.filter((t) => showArchived || !t.archived)
  const archivedCount = types.filter((t) => t.archived).length

  return <Container className="flex flex-col gap-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Heading level="h1">Typy konzultací</Heading>
        <Text className="text-ui-fg-subtle">Každý typ je samostatná nabídka na webu s vlastní délkou, pauzou a cenou. Volné časy zadáváte jednou pro všechny typy na stránce „Volné termíny“.</Text>
      </div>
      <Button onClick={openNew}>Nový typ konzultace</Button>
    </div>

    {loadError && <Alert variant="error">{loadError} <Button size="small" variant="transparent" onClick={() => void load()}>Zkusit znovu</Button></Alert>}

    {loading ? <Text>Načítám…</Text> : visible.length === 0 ? (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6">
        <Text weight="plus">Zatím tu není žádný typ konzultace.</Text>
        <Text className="text-ui-fg-subtle">Začněte tlačítkem „Nový typ konzultace“ – například „Úvodní konzultace, 60 minut“.</Text>
      </div>
    ) : (
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Název</Table.HeaderCell>
            <Table.HeaderCell>Délka</Table.HeaderCell>
            <Table.HeaderCell>Pauza po</Table.HeaderCell>
            <Table.HeaderCell>Cena</Table.HeaderCell>
            <Table.HeaderCell>Forma</Table.HeaderCell>
            <Table.HeaderCell>Stav</Table.HeaderCell>
            <Table.HeaderCell className="text-right">Akce</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {visible.map((type) => <Table.Row key={type.id}>
            <Table.Cell><span className="font-medium">{type.title}</span></Table.Cell>
            <Table.Cell>{type.duration_minutes} min</Table.Cell>
            <Table.Cell>{type.buffer_minutes} min</Table.Cell>
            <Table.Cell>{type.price_eur === null ? "—" : priceFmt.format(type.price_eur)}</Table.Cell>
            <Table.Cell><Badge size="2xsmall">{FORM_LABEL[type.form]}</Badge></Table.Cell>
            <Table.Cell>{statusOf(type)}</Table.Cell>
            <Table.Cell className="text-right">
              <div className="flex justify-end gap-2">
                {!type.archived && <Button size="small" variant="secondary" onClick={() => openEdit(type)}>Upravit</Button>}
                {type.archived
                  ? <Button size="small" variant="secondary" onClick={() => void setArchived(type, false)}>Obnovit</Button>
                  : <Button size="small" variant="transparent" onClick={() => void setArchived(type, true)}>Archivovat</Button>}
              </div>
            </Table.Cell>
          </Table.Row>)}
        </Table.Body>
      </Table>
    )}

    {archivedCount > 0 && <div className="flex items-center gap-2">
      <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
      <Label htmlFor="show-archived">Zobrazit archivované ({archivedCount})</Label>
    </div>}

    <Drawer open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null) }}>
      <Drawer.Content>
        <form onSubmit={submit} className="flex h-full flex-col overflow-hidden">
          <Drawer.Header>
            <Drawer.Title>{editing === "new" ? "Nový typ konzultace" : "Upravit typ konzultace"}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-4 overflow-y-auto">
            <fieldset disabled={saving} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="bt-title">Název (uvidí ho zákaznice)</Label>
                <Input id="bt-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Úvodní konzultace" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="bt-duration">Délka konzultace (minuty)</Label>
                  <Input id="bt-duration" inputMode="numeric" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} required />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="bt-buffer">Pauza po konzultaci (minuty)</Label>
                  <Input id="bt-buffer" inputMode="numeric" value={form.buffer_minutes} onChange={(e) => setForm({ ...form, buffer_minutes: e.target.value })} required />
                </div>
              </div>
              <Text size="small" className="text-ui-fg-subtle">Pauza je čas na oddech nebo poznámky. Během ní si nikdo další termín zarezervovat nemůže.</Text>
              <div className="flex flex-col gap-1">
                <Label htmlFor="bt-price">Cena (EUR)</Label>
                <Input id="bt-price" inputMode="decimal" value={form.price_eur} onChange={(e) => setForm({ ...form, price_eur: e.target.value })} placeholder="49,90" required />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="bt-form">Forma</Label>
                <Select value={form.form} onValueChange={(value) => setForm({ ...form, form: value as FormState["form"] })}>
                  <Select.Trigger id="bt-form"><Select.Value /></Select.Trigger>
                  <Select.Content>
                    <Select.Item value="online">Online (videohovor)</Select.Item>
                    <Select.Item value="in_person">Osobně</Select.Item>
                  </Select.Content>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="bt-description">Popis (nepovinné)</Label>
                <Textarea id="bt-description" rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Co konzultace obsahuje a pro koho je." />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="bt-active" checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />
                <Label htmlFor="bt-active">Nabízet na webu</Label>
              </div>
              {formError && <Alert variant="error">{formError}</Alert>}
            </fieldset>
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild><Button type="button" variant="secondary" disabled={saving}>Zrušit</Button></Drawer.Close>
            <Button type="submit" isLoading={saving}>Uložit</Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  </Container>
}

export const config = defineRouteConfig({ label: "Typy konzultací", icon: Tag })
