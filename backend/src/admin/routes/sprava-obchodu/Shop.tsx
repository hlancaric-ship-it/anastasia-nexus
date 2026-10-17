import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { ApiError, FieldError, caption, categoryInput, couponInput, customerInput, labels, listUrl, money, orderInput, priceUpdate, productInput, request, resources, sections, simplePrice, supportedCoupon, type Row, type Section, type Values, type Variant } from "../../lib/shop"
import { AdminThemeFrame, useAdminTheme } from "../../components/AdminTheme"
import "./shop.css"

type Editor = { section: Exclude<Section, 'prehled'>; row?: Row; variant?: Variant }
const initialSection = (): Section => sections.find(s => s === window.location.hash.slice(1)) ?? 'prehled'
const statusLabels: Record<string, string> = { draft: 'Koncept', published: 'Zverejnené', active: 'Aktívny', inactive: 'Vypnutý', pending: 'Čaká na vybavenie', completed: 'Dokončená', canceled: 'Zrušená', archived: 'Archivované', captured: 'Platba prijatá', not_paid: 'Nezaplatená', awaiting: 'Čaká na platbu', partially_captured: 'Čiastočne zaplatená', refunded: 'Vrátená platba', partially_refunded: 'Čiastočne vrátená', authorized: 'Platba schválená', not_fulfilled: 'Nevybavená', fulfilled: 'Pripravená', shipped: 'Odoslaná', delivered: 'Doručená', partially_fulfilled: 'Čiastočne pripravená', partially_shipped: 'Čiastočne odoslaná', partially_delivered: 'Čiastočne doručená', requires_action: 'Treba overiť platbu' }
const statusText = (value?: string) => value ? statusLabels[value] ?? 'Stav treba overiť' : 'Neuvedené'
function fields(editor: Editor): Values {
  const r = editor.row
  return { title: r?.title ?? '', description: r?.description ?? '', status: r?.status ?? 'draft',
    categories: r?.categories?.map(c => c.id).join(',') ?? '', amount: editor.variant ? String(simplePrice(editor.variant)?.amount ?? '') : '', sku: '',
    name: r?.name ?? '', is_active: r?.is_active === false ? 'false' : 'true', parent_category_id: r?.parent_category_id ?? '',
    code: r?.code ?? '', value: String(r?.application_method?.value ?? ''), limit: r?.limit == null ? '' : String(r.limit),
    email: r?.email ?? '', first_name: r?.first_name ?? '', last_name: r?.last_name ?? '', phone: r?.phone ?? '', note: typeof r?.metadata?.shop_admin_note === 'string' ? r.metadata.shop_admin_note : '' }
}

export default function Shop() {
  const theme = useAdminTheme()
  const [section, setSection] = useState<Section>(initialSection)
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<Row[]>([]), [count, setCount] = useState(0), [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(''), [notice, setNotice] = useState(''), [reload, setReload] = useState(0)
  const [counts, setCounts] = useState<Partial<Record<Section, number>>>({})
  const [editor, setEditor] = useState<Editor | null>(null), [values, setValues] = useState<Values>({}), [errors, setErrors] = useState<Values>({})
  const [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false), [dirty, setDirty] = useState(false)
  const [categories, setCategories] = useState<Row[]>([]), [context, setContext] = useState<{ channel: string; profile: string }>()
  const [contextError, setContextError] = useState(''), [opening, setOpening] = useState(false)
  const formRef = useRef<HTMLFormElement>(null), dialogRef = useRef<HTMLDialogElement>(null), errorRef = useRef<HTMLDivElement>(null)
  const saveLock = useRef(false), openLock = useRef(false), mounted = useRef(true), requestSequence = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const navigate = useCallback((next: Section) => {
    if (saveLock.current || openLock.current) return
    if (dirty && !window.confirm('Máte neuložené zmeny. Chcete ich zahodiť?')) return
    setEditor(null); setDirty(false); setSection(next); setSearch(''); setQuery(''); setOffset(0); setLoadError(''); setNotice('')
    window.history.replaceState(null, '', `#${next}`)
  }, [dirty])
  useEffect(() => {
    const onHash = () => { const next = initialSection(); if (saveLock.current || (dirty && !window.confirm('Máte neuložené zmeny. Chcete ich zahodiť?'))) { window.history.replaceState(null, '', `#${section}`); return } setDirty(false); setEditor(null); setSection(next); setSearch(''); setQuery(''); setOffset(0) }
    const onUnload = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('hashchange', onHash); window.addEventListener('beforeunload', onUnload)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('beforeunload', onUnload) }
  }, [navigate, dirty, saving, section])
  useEffect(() => {
    const controller = new AbortController()
    setContextError(''); setContext(undefined); setCategories([])
    async function settings() {
      const all: Row[] = []
      for (let start = 0; ; start += 100) {
        const page = await request<{ product_categories: Row[]; count: number }>(`/admin/product-categories?limit=100&offset=${start}`, undefined, controller.signal)
        all.push(...page.product_categories)
        if (all.length >= page.count) break
        if (!page.product_categories.length || start >= 9900) throw new Error('Kategórie sa nepodarilo načítať celé. Skúste to neskôr.')
      }
      const [stores, profiles] = await Promise.all([
        request<{ stores: { default_sales_channel_id?: string }[] }>('/admin/stores', undefined, controller.signal),
        request<{ shipping_profiles: { id: string; type: string }[] }>('/admin/shipping-profiles?limit=100', undefined, controller.signal),
      ])
      const profile = profiles.shipping_profiles.find(p => p.type === 'default')
      const channel = stores.stores[0]?.default_sales_channel_id
      if (!controller.signal.aborted) { setCategories(all); if (profile && channel) setContext({ channel, profile: profile.id }) }
    }
    void settings().catch(e => { if (!controller.signal.aborted) setContextError(e instanceof Error ? e.message : 'Nastavenie sa nepodarilo načítať.') })
    return () => controller.abort()
  }, [reload])
  useEffect(() => {
    const controller = new AbortController(); const sequence = ++requestSequence.current
    setLoading(true); setLoadError(''); setRows([])
    async function load() {
      if (section === 'prehled') {
        const results = await Promise.allSettled(sections.filter(s => s !== 'prehled').map(async s => {
          const result = await request<{ count: number }>(listUrl(s as Exclude<Section, 'prehled'>), undefined, controller.signal)
          if (!Number.isSafeInteger(result.count) || result.count < 0) throw new Error('Neplatný počet záznamov.')
          return [s, result.count] as const
        }))
        if (controller.signal.aborted) return
        const next: Partial<Record<Section, number>> = {}
        results.forEach(r => { if (r.status === 'fulfilled') next[r.value[0]] = r.value[1] })
        setCounts(next)
        if (results.some(r => r.status === 'rejected')) setLoadError('Niektoré údaje sa nepodarilo načítať. Chýbajúci počet neznamená nulu.')
      } else {
        const result = await request<Record<string, unknown>>(listUrl(section, query, offset), undefined, controller.signal)
        if (!Array.isArray(result[resources[section].key]) || !Number.isSafeInteger(result.count) || Number(result.count) < 0) throw new Error('Server nevrátil očakávaný zoznam.')
        if (!controller.signal.aborted && sequence === requestSequence.current) { setRows(result[resources[section].key] as Row[]); setCount(result.count as number) }
      }
    }
    void load().catch(e => { if (!controller.signal.aborted) setLoadError(e instanceof Error ? e.message : 'Zoznam sa nepodarilo načítať.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [section, query, offset, reload])
  useEffect(() => {
    if (editor && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal()
  }, [editor])
  useEffect(() => { if (Object.keys(errors).length) errorRef.current?.focus() }, [errors])
  const refresh = () => setReload(n => n + 1)
  function close() {
    if (saveLock.current || (dirty && !window.confirm('Máte neuložené zmeny. Chcete ich zahodiť?'))) return
    setEditor(null); setDirty(false); setErrors({}); setUncertain(false)
  }
  async function open(row?: Row, variant?: Variant) {
    if (section === 'prehled' || openLock.current) return
    if (contextError && (section === 'produkty' || section === 'kategorie')) { setNotice(contextError); return }
    openLock.current = true; setOpening(true); setNotice('')
    try {
      let fresh = row
      if (row) {
        const spec = resources[section]
        const suffix = spec.fields ? `?${new URLSearchParams({ fields: spec.fields })}` : ''
        const body = await request<Record<string, Row>>(`${spec.path}/${encodeURIComponent(row.id)}${suffix}`)
        const key = { produkty: 'product', ceny: 'product', kategorie: 'product_category', kupony: 'promotion', objednavky: 'order', zakaznicky: 'customer' }[section]
        fresh = body[key]
        if (!fresh?.id) throw new Error('Detail sa nepodarilo načítať. Obnovte zoznam.')
      }
      if (!mounted.current) return
      const currentVariant = variant ? fresh?.variants?.find(v => v.id === variant.id) : undefined
      if (variant && (!currentVariant || !simplePrice(currentVariant))) throw new Error('Varianta nemá jednu bežnú cenu v eurách. Zjednodušený editor ju bezpečne neupraví.')
      const next = { section, row: fresh, variant: currentVariant }
      setEditor(next); setValues(fields(next)); setErrors({}); setUncertain(false); setDirty(false)
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Detail sa nepodarilo načítať.') }
    finally { openLock.current = false; if (mounted.current) setOpening(false) }
  }
  function change(name: string, value: string) { setValues(v => ({ ...v, [name]: value })); setDirty(true); setErrors(e => { const next = { ...e }; delete next[name]; return next }) }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!editor || saveLock.current || uncertain) return
    setErrors({})
    const { section: target, row, variant } = editor
    let path = resources[target].path + (row ? `/${encodeURIComponent(row.id)}` : '')
    let payload: unknown
    try {
      if (target === 'produkty') payload = productInput(values, row, context)
      else if (target === 'kategorie') payload = categoryInput(values, row)
      else if (target === 'kupony') payload = couponInput(values, row)
      else if (target === 'zakaznicky') payload = customerInput(values)
      else if (target === 'ceny' && variant && row) { const update = priceUpdate(variant, values.amount); payload = { price_id: update.prices[0].id, amount: update.prices[0].amount, expected_amount: simplePrice(variant)!.amount }; path = `/admin/shop-prices/${encodeURIComponent(variant.id)}` }
      else if (target === 'objednavky' && row) payload = orderInput(values, row)
      else return
    } catch (e) { setErrors({ [e instanceof FieldError ? e.field : '_form']: e instanceof Error ? e.message : 'Skontrolujte formulár.' }); return }
    saveLock.current = true; setSaving(true)
    try {
      // Re-read before editing. This detects intervening changes, but is not an atomic version lock.
      if (row) {
        const spec = resources[target], key = { produkty: 'product', ceny: 'product', kategorie: 'product_category', kupony: 'promotion', objednavky: 'order', zakaznicky: 'customer' }[target]
        const fresh = (await request<Record<string, Row>>(`${spec.path}/${encodeURIComponent(row.id)}${spec.fields ? `?${new URLSearchParams({ fields: spec.fields })}` : ''}`))[key]
        if (JSON.stringify(fresh) !== JSON.stringify(row)) throw new ApiError(409, 'Záznam sa medzičasom zmenil. Zavrite formulár a otvorte ho znova; vaše zmeny zatiaľ zostali tu.')
      }
      const written = await request<Record<string, Row>>(path, payload)
      // Success must be read back from the owner before reporting completion.
      const singular = { produkty: 'product', ceny: 'price', kategorie: 'product_category', kupony: 'promotion', objednavky: 'order', zakaznicky: 'customer' }[target]
      const saved = written[singular]
      if (!saved?.id) throw new ApiError(0, 'Server nepotvrdil uložený záznam. Overte ho v zozname.', true)
      const readPath = target === 'ceny' ? `/admin/products/${encodeURIComponent(row!.id)}` : `${resources[target].path}/${encodeURIComponent(saved.id)}`
      try {
        const check = await request<Record<string, Row>>(readPath)
        const readKey = target === 'ceny' ? 'product' : singular
        if (check[readKey]?.id !== (target === 'ceny' ? row!.id : saved.id)) throw new Error('READBACK_MISMATCH')
      } catch { throw new ApiError(0, 'Zmena bola odoslaná, ale výsledok sa nepodarilo overiť. Obnovte zoznam pred ďalším pokusom.', true) }
      if (!mounted.current) return
      setEditor(null); setDirty(false); setNotice('Zmena je uložená. Zoznam sa načíta znova.'); refresh()
    } catch (e) {
      if (!mounted.current) return
      const ambiguous = e instanceof ApiError && e.uncertain
      setUncertain(ambiguous)
      setErrors({ _form: e instanceof Error ? e.message : 'Zmenu sa nepodarilo uložiť.' })
    } finally { saveLock.current = false; if (mounted.current) setSaving(false) }
  }
  function field(name: string, label: string, opts: { type?: string; required?: boolean; max?: number; help?: string } = {}) {
    return <label className="shop-field" key={name} htmlFor={`shop-${name}`}><span>{label}</span><input id={`shop-${name}`} name={name} type={opts.type ?? 'text'} inputMode={['amount', 'value'].includes(name) ? 'decimal' : undefined} value={values[name] ?? ''} onChange={e => change(name, e.target.value)} required={opts.required} maxLength={opts.max ?? 200} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `shop-error-${name}` : undefined} autoComplete={name === 'email' ? 'email' : name === 'first_name' ? 'given-name' : name === 'last_name' ? 'family-name' : 'off'} />{opts.help && <small>{opts.help}</small>}{errors[name] && <small className="shop-field-error" id={`shop-error-${name}`}>{errors[name]}</small>}</label>
  }
  function select(name: string, label: string, options: { value: string; label: string }[]) {
    return <label className="shop-field" htmlFor={`shop-${name}`}><span>{label}</span><select id={`shop-${name}`} value={values[name] ?? ''} onChange={e => change(name, e.target.value)} aria-invalid={!!errors[name]}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{errors[name] && <small className="shop-field-error">{errors[name]}</small>}</label>
  }
  const newLabel = { produkty: 'Pridať produkt', kategorie: 'Pridať kategóriu', kupony: 'Vytvoriť kupón', zakaznicky: 'Pridať zákazníčku' }
  const title = editor ? editor.variant ? `Cena: ${editor.row?.title} — ${editor.variant.title}` : editor.row ? caption(editor.row) : newLabel[editor.section as keyof typeof newLabel] ?? 'Nový záznam' : ''
  return <AdminThemeFrame selection={theme.selection}><div className="anastasia-shop">
    {theme.error && <div className="shop-error" role="alert">{theme.error} Používame predvolený vzhľad.</div>}
    <header className="shop-header"><div><p className="shop-eyebrow">ANASTASIA · Váš obchod</p><h1>Správa obchodu</h1><p>Produkty, objednávky a zákazníčky na jednom mieste.</p></div><button className="shop-button" onClick={refresh} disabled={loading || saving}>Obnoviť údaje</button></header>
    <nav className="shop-tabs" aria-label="Správa obchodu">{sections.map(s => <button key={s} aria-current={section === s ? 'page' : undefined} onClick={() => navigate(s)}>{labels[s]}</button>)}</nav>
    {notice && <div className="shop-message" role="status">{notice}</div>}
    {loadError && <div className="shop-error" role="alert">{loadError} <button className="shop-link" onClick={refresh}>Načítať znova</button></div>}
    {section === 'prehled' ? <section aria-label="Prehľad agend" className="shop-cards" aria-busy={loading}>{sections.filter(s => s !== 'prehled').map(s => <button className="shop-card" key={s} onClick={() => navigate(s)}><span>{labels[s]}</span><strong>{loading ? '…' : counts[s] ?? 'Nedostupné'}</strong><small>{s === 'ceny' ? 'produktov s cenami · Otvoriť →' : 'záznamov · Otvoriť →'}</small></button>)}</section> : <section className="shop-panel" aria-labelledby="shop-section-title">
      <div className="shop-toolbar"><h2 id="shop-section-title">{labels[section]}</h2><form role="search" onSubmit={e => { e.preventDefault(); setQuery(search); setOffset(0) }}><label className="shop-sr" htmlFor="shop-search">Hľadať v agende {labels[section]}</label><input id="shop-search" placeholder="Hľadať…" value={search} onChange={e => setSearch(e.target.value)} maxLength={200} /><button className="shop-button" type="submit">Hľadať</button></form>{section in newLabel && <button className="shop-button primary" disabled={opening || !!contextError || (section === 'produkty' && !context)} onClick={() => void open()}>{newLabel[section as keyof typeof newLabel]}</button>}</div>
      {contextError && <p className="shop-error" role="alert">{contextError} Nové produkty a výber kategórií zatiaľ nie sú dostupné.</p>}
      {section === 'kupony' && <p className="shop-help">Bežné percentuálne kupóny na položky. Zložitejšie podmienky sa tu neprepisujú.</p>}
      {section === 'ceny' && <p className="shop-help">Základné ceny v eurách. Konečnú cenu, DPH a osobné zľavy určuje server. Ceny s osobitnými pravidlami tento editor nemení.</p>}
      {loading ? <p role="status" className="shop-empty">Načítavame údaje…</p> : !loadError && !rows.length ? <p className="shop-empty">{query ? 'Pre toto hľadanie sa nič nenašlo.' : 'Zatiaľ tu nie sú žiadne záznamy.'}</p> : !loadError && <div className="shop-table-wrap"><table><thead><tr><th scope="col">{section === 'objednavky' ? 'Objednávka' : section === 'zakaznicky' ? 'Zákazníčka' : 'Názov'}</th><th scope="col">{section === 'ceny' ? 'Varianta a základná cena' : 'Podrobnosti'}</th><th scope="col">Akcia</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><th scope="row">{caption(row)}{row.email && <small>{row.email}</small>}</th><td>{section === 'ceny' ? <div className="shop-price-list">{row.variants?.map(v => <div key={v.id}><span>{v.title} · {simplePrice(v) ? money(simplePrice(v)!.amount) : 'Osobitné cenové pravidlá'}</span><button className="shop-button" disabled={!simplePrice(v) || opening} onClick={() => void open(row, v)}>Upraviť cenu</button></div>)}</div> : section === 'kategorie' ? row.is_active ? 'Viditeľná' : 'Skrytá' : section === 'kupony' ? `${row.application_method?.type === 'percentage' ? `${row.application_method.value} % · ` : ''}${statusText(row.status)}${supportedCoupon(row) ? '' : ' · Osobitné podmienky'}` : section === 'objednavky' ? `${money(row.total, row.currency_code)} · ${statusText(row.payment_status)}` : section === 'zakaznicky' ? [row.first_name, row.last_name].filter(Boolean).join(' ') : statusText(row.status)}</td><td>{section !== 'ceny' && <button className="shop-button" disabled={opening} onClick={() => void open(row)}>{section === 'objednavky' ? 'Otvoriť objednávku' : 'Otvoriť'}</button>}</td></tr>)}</tbody></table></div>}
      {!loading && !loadError && <footer className="shop-pagination"><span>{count ? `${offset + 1}–${Math.min(offset + rows.length, count)} z ${count}` : '0 záznamov'}</span><button className="shop-button" disabled={!offset} onClick={() => setOffset(n => Math.max(0, n - 12))}>Predchádzajúce</button><button className="shop-button" disabled={offset + 12 >= count} onClick={() => setOffset(n => n + 12)}>Ďalšie</button></footer>}
    </section>}
    {editor && <dialog ref={dialogRef} className="shop-dialog" aria-labelledby="shop-dialog-title" onCancel={e => { e.preventDefault(); close() }}><form ref={formRef} onSubmit={submit} noValidate>
      <header><div><p className="shop-eyebrow">{labels[editor.section]}</p><h2 id="shop-dialog-title">{title}</h2></div><button type="button" className="shop-button" disabled={saving} onClick={close}>Zavrieť</button></header>
      <div className="shop-dialog-body">
        {!!Object.keys(errors).length && <div className="shop-error" ref={errorRef} tabIndex={-1} role="alert"><strong>Zmenu treba skontrolovať.</strong><ul>{Object.entries(errors).map(([key, message]) => <li key={key}>{key === '_form' ? message : <a href={`#shop-${key}`} onClick={e => { e.preventDefault(); document.getElementById(`shop-${key}`)?.focus() }}>{message}</a>}</li>)}</ul></div>}
        <fieldset disabled={saving || uncertain}>
          {editor.section === 'produkty' && <>{field('title', 'Názov produktu', { required: true })}<label className="shop-field" htmlFor="shop-description"><span>Popis</span><textarea id="shop-description" value={values.description} onChange={e => change('description', e.target.value)} maxLength={5000} /></label>{editor.row ? select('status', 'Zobrazenie', [{ value: 'draft', label: 'Koncept – nezverejnený' }, { value: 'published', label: 'Zverejnený' }, { value: 'proposed', label: 'Na schválenie' }, { value: 'rejected', label: 'Zamietnutý' }]) : <><p className="shop-help">Nový produkt sa uloží ako koncept so sledovaním zásob. Zverejnite ho až po doplnení skladu.</p>{field('sku', 'Kód produktu (nepovinné)')}{field('amount', 'Základná cena (€)', { required: true, help: 'Zadajte cenu podľa daňového nastavenia obchodu. Výpočet konečnej ceny robí server.' })}</>}
          <fieldset className="shop-category-picker"><legend>Kategórie</legend>{categories.length ? categories.map(c => <label key={c.id}><input type="checkbox" checked={values.categories.split(',').includes(c.id)} onChange={e => { const ids = new Set(values.categories.split(',').filter(Boolean)); if (e.target.checked) ids.add(c.id); else ids.delete(c.id); change('categories', [...ids].join(',')) }} />{c.name}</label>) : <p>Zatiaľ nie sú vytvorené kategórie.</p>}</fieldset></>}
          {editor.section === 'ceny' && <>{field('amount', 'Nová základná cena (€)', { required: true })}<p className="shop-help">Mení sa iba táto varianta. Výsledná cena pre zákazníčku sa vypočíta na serveri.</p></>}
          {editor.section === 'kategorie' && <>{field('name', 'Názov kategórie', { required: true })}{field('description', 'Popis', { max: 5000 })}{select('is_active', 'Zobrazenie', [{ value: 'true', label: 'Viditeľná' }, { value: 'false', label: 'Skrytá' }])}{select('parent_category_id', 'Nadradená kategória', [{ value: '', label: 'Hlavná kategória' }, ...categories.filter(c => c.id !== editor.row?.id).map(c => ({ value: c.id, label: c.name ?? 'Bez názvu' }))])}</>}
          {editor.section === 'kupony' && <>{editor.row && !supportedCoupon(editor.row) ? <p className="shop-help">Tento kupón má osobitné pravidlá, ktoré tento editor nepodporuje. Jeho podmienky zostávajú zachované.</p> : <>{field('code', 'Kód kupónu', { required: true, max: 128 })}{field('value', 'Zľava (%)', { required: true, help: 'Viac ako 0 %, najviac 100 %. Konečnú zľavu určí server.' })}{field('limit', 'Najviac použití (nepovinné)', { max: 9 })}{select('status', 'Stav', [{ value: 'draft', label: 'Koncept' }, { value: 'active', label: 'Aktívny' }, { value: 'inactive', label: 'Vypnutý' }])}</>}</>}
          {editor.section === 'zakaznicky' && <>{field('first_name', 'Meno', { required: true, max: 100 })}{field('last_name', 'Priezvisko', { required: true, max: 100 })}{field('email', 'E-mail', { type: 'email', required: true, max: 254 })}{field('phone', 'Telefón (nepovinné)', { type: 'tel', max: 50 })}<p className="shop-help">Tu upravujete profil zákazníčky. Jej heslo sa nezobrazuje ani nemení.</p></>}
          {editor.section === 'objednavky' && <><div className="shop-order-summary"><p><strong>{money(editor.row?.total, editor.row?.currency_code)}</strong></p><p>{statusText(editor.row?.payment_status)} · {statusText(editor.row?.fulfillment_status)}</p>{editor.row?.items?.map(i => <p key={i.id}>{i.title} · {i.quantity} ks · {money(i.unit_price, editor.row?.currency_code)} / ks</p>)}</div>{field('email', 'Kontaktný e-mail', { type: 'email', required: true, max: 254 })}<label className="shop-field" htmlFor="shop-note"><span>Interná poznámka</span><textarea id="shop-note" value={values.note} onChange={e => change('note', e.target.value)} maxLength={2000} aria-invalid={!!errors.note} /><small>Bez zdravotných údajov. {values.note.length}/2000</small></label><p className="shop-help">Uloženie kontaktu alebo poznámky nemení platbu ani nevracia peniaze.</p></>}
        </fieldset>
      </div><footer>{uncertain && <button type="button" className="shop-button" onClick={() => { setEditor(null); setDirty(false); refresh(); setNotice('Overte výsledok v obnovenom zozname pred ďalšou zmenou.') }}>Obnoviť zoznam a overiť výsledok</button>}<button className="shop-button primary" type="submit" disabled={saving || uncertain || (editor.section === 'kupony' && !!editor.row && !supportedCoupon(editor.row))}>{saving ? 'Ukladáme…' : 'Uložiť zmeny'}</button></footer>
    </form></dialog>}
  </div></AdminThemeFrame>
}
