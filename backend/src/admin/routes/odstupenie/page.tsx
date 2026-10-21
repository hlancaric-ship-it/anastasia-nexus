import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath } from "@medusajs/icons"
import { Button, Container, Heading, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

// Odstúpenia od zmluvy poslané formulárom na webe (časť C právnych textov klientky).
type Withdrawal = {
  id: string
  order_number: string
  email: string
  items: string[] | string
  order_date: string | null
  name: string | null
  reason: string | null
  status: "received" | "processed" | "closed"
  received_at: string
  changed_by: string | null
}

type Status = "received" | "processed" | "closed"
const STATUS: Record<Status, { label: string; color: "orange" | "blue" | "green" }> = {
  received: { label: "Prijaté", color: "orange" },
  processed: { label: "Spracované", color: "blue" },
  closed: { label: "Vybavené", color: "green" },
}
const NEXT: Record<Status, Status | null> = { received: "processed", processed: "closed", closed: null }
const NEXT_LABEL: Record<Status, string> = { received: "Označiť ako spracované", processed: "Označiť ako vybavené", closed: "Vybavené" }

const date = (value: string | null) =>
  value ? new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"
const items = (value: string[] | string) => (Array.isArray(value) ? value.join(", ") : String(value ?? ""))

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.message || "Spojenie so serverom zlyhalo.")
  return body as T
}

export default function ContractWithdrawalsPage() {
  const [rows, setRows] = useState<Withdrawal[]>([])
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    try {
      const data = await api<{ withdrawals: Withdrawal[]; count: number }>("/admin/contract-withdrawals?limit=100")
      setRows(data.withdrawals ?? [])
      setCount(data.count ?? 0)
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Záznamy sa nepodarilo načítať.")
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function advance(row: Withdrawal) {
    const next = NEXT[row.status]
    if (!next) return
    setBusy(row.id)
    try {
      await api(`/admin/contract-withdrawals/${encodeURIComponent(row.id)}`, { method: "POST", body: JSON.stringify({ status: next }) })
      toast("Stav odstúpenia je uložený.")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stav sa nepodarilo uložiť.")
    } finally { setBusy(null) }
  }

  return <Container className="flex flex-col gap-6">
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Heading level="h1">Odstúpenia od zmluvy</Heading>
        <Text>Oznámenia o odstúpení od zmluvy poslané formulárom na webe (časť C právnych textov). Zákazník dostal potvrdenie doručenia e-mailom.</Text>
      </div>
      <Button variant="secondary" onClick={load} isLoading={busy === "reload"}>
        <ArrowPath className="mr-2 h-4 w-4" />Obnoviť
      </Button>
    </div>
    {error && <Text role="alert" className="text-danger">{error}</Text>}
    <Text size="small" className="text-ui-fg-subtle">Celkom záznamov: {count}</Text>
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Číslo objednávky</Table.HeaderCell>
          <Table.HeaderCell>Zákazník</Table.HeaderCell>
          <Table.HeaderCell>Položky</Table.HeaderCell>
          <Table.HeaderCell>Prijaté</Table.HeaderCell>
          <Table.HeaderCell>Stav</Table.HeaderCell>
          <Table.HeaderCell className="text-right">Akcia</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.length === 0 ? <Table.Row><Table.Cell><Text size="small">Zatiaľ žiadne odstúpenie od zmluvy.</Text></Table.Cell></Table.Row> : rows.map(row => {
          const next = NEXT[row.status]
          return <Table.Row key={row.id}>
            <Table.Cell>{row.order_number}{row.order_date ? <Text size="small" className="block text-ui-fg-subtle">{date(row.order_date)}</Text> : null}</Table.Cell>
            <Table.Cell>{row.name || "—"}<Text size="small" className="block text-ui-fg-subtle">{row.email}</Text></Table.Cell>
            <Table.Cell><Text size="small">{items(row.items)}</Text>{row.reason ? <Text size="small" className="block text-ui-fg-subtle">Dôvod: {row.reason}</Text> : null}</Table.Cell>
            <Table.Cell><Text size="small">{date(row.received_at)}</Text></Table.Cell>
            <Table.Cell><StatusBadge color={STATUS[row.status]?.color ?? "orange"}>{STATUS[row.status]?.label ?? row.status}</StatusBadge></Table.Cell>
            <Table.Cell className="text-right">{next ? <Button variant="secondary" size="small" onClick={() => advance(row)} isLoading={busy === row.id}>{NEXT_LABEL[row.status]}</Button> : <Text size="small">—</Text>}</Table.Cell>
          </Table.Row>
        })}
      </Table.Body>
    </Table>
  </Container>
}

export const config = defineRouteConfig({ label: "Odstúpenia od zmluvy" })
