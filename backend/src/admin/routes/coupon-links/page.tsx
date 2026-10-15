import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useState, type FormEvent } from "react"

type Result = { url: string; qr: { mime_type: string; base64: string } }
export default function CouponLinksPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [format, setFormat] = useState("svg")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true); setError(""); setResult(null)
    try {
      const response = await fetch("/admin/coupon-links", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produkt: form.get("produkt"), kupon: form.get("kupon"), ks: Number(form.get("ks")), format }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || "QR kód sa nepodarilo vytvoriť.")
      setResult(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spojenie so serverom zlyhalo.")
    } finally { setBusy(false) }
  }
  return <Container className="flex flex-col gap-6">
    <div><Heading level="h1">QR kupóny</Heading><Text>Vytvorte odkaz na produkt s kupónom a stiahnite QR kód.</Text></div>
    <Text>Aktivácia zľavy v košíku čaká na dokončenie integrácie. QR kódy zatiaľ netlačte pre zákazníkov.</Text>
    <form onSubmit={submit} onChange={() => { setResult(null); setError("") }} className="flex max-w-xl flex-col gap-4" aria-busy={busy}>
      <fieldset disabled={busy} className="flex flex-col gap-4">
        <div><Label htmlFor="produkt">Kód produktu</Label><Input id="produkt" name="produkt" required maxLength={128} placeholder="KO.001" /></div>
        <div><Label htmlFor="kupon">Kód kupónu</Label><Input id="kupon" name="kupon" required maxLength={128} autoComplete="off" /></div>
        <div><Label htmlFor="ks">Počet kusov</Label><Input id="ks" name="ks" type="number" min={1} max={999} step={1} defaultValue={1} required /></div>
        <div><Label htmlFor="format">Formát QR kódu</Label><select id="format" className="ml-3 min-h-11 rounded border p-2 text-ui-fg-base bg-ui-bg-base" value={format} onChange={e => setFormat(e.target.value)}>
          <option value="svg">SVG – vektorový obrázok</option><option value="png">PNG – obrázok</option>
        </select></div>
        <Button type="submit" isLoading={busy}>Vytvoriť QR kód</Button>
      </fieldset>
    </form>
    {error && <Text role="alert">{error}</Text>}
    {result && <section aria-label="Vygenerovaný QR kód" className="flex flex-col items-start gap-4">
      <Text role="status">QR kód bol vytvorený. Uplatnenie zľavy zatiaľ nie je zapojené.</Text>
      <Label htmlFor="coupon-url">Odkaz na produkt s kupónom</Label>
      <Input id="coupon-url" readOnly value={result.url} onFocus={e => e.target.select()} />
      <img width={256} height={256} alt="QR kód odkazu na produkt s kupónom" src={`data:${result.qr.mime_type};base64,${result.qr.base64}`} />
      <a className="underline min-h-11 py-3" download={`kupon.${result.qr.mime_type === "image/png" ? "png" : "svg"}`} href={`data:${result.qr.mime_type};base64,${result.qr.base64}`}>Stiahnuť QR kód</a>
    </section>}
  </Container>
}
export const config = defineRouteConfig({ label: "QR kupóny" })
