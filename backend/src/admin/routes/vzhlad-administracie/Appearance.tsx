import { useEffect, useRef, useState } from 'react'
import { AdminThemeFrame, defaultState, themeRequest, type ThemeState } from '../../components/AdminTheme'
import { DEFAULT_THEME, themeSelection, tokensFor, type ThemeSelection } from '../../../lib/admin-theme/policy'
const schemes: { id: ThemeSelection['scheme']; title: string; description: string }[] = [
  { id: 'original', title: 'Pôvodná ANASTASIA', description: 'Fialková a modrá z vášho pôvodného webu.' },
  { id: 'forest', title: 'Lesná', description: 'Pokojná zelená a krémová.' },
  { id: 'wine', title: 'Vínová', description: 'Teplé vínové a svetlé tóny.' },
  { id: 'night', title: 'Nočná', description: 'Tmavá plocha so svetlým textom.' },
  { id: 'custom', title: 'Vlastné farby', description: 'Vaša farba navigácie a tlačidiel.' },
]
export default function Appearance() {
  const [stored, setStored] = useState<ThemeState>(defaultState), [draft, setDraft] = useState<ThemeSelection>(defaultState.selection)
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [mustReload, setMustReload] = useState(false)
  const [custom, setCustom] = useState({ accent: DEFAULT_THEME.accent, navigation: DEFAULT_THEME.navigation })
  const saveLock = useRef(false), readLock = useRef(false), readSequence = useRef(0), live = useRef(true), errorRef = useRef<HTMLDivElement>(null)
  const dirty = JSON.stringify(stored.selection) !== JSON.stringify(draft)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => {
    const controller = new AbortController(); live.current = true
    void load(controller.signal)
    return () => { live.current = false; controller.abort(); readSequence.current++; readLock.current = false }
  }, [])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty || saving) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, saving])
  async function load(signal?: AbortSignal) {
    if (readLock.current || saveLock.current) return
    const sequence = ++readSequence.current; readLock.current = true; setLoading(true); setError(''); setMessage('')
    try {
      const next = await themeRequest(undefined, signal)
      if (signal?.aborted || !live.current || sequence !== readSequence.current) return
      setStored(next); setDraft(next.selection); setCustom({ accent: next.selection.accent, navigation: next.selection.navigation }); setLoaded(true); setMustReload(false)
    } catch (e) { if (!signal?.aborted && live.current && sequence === readSequence.current) setError(e instanceof Error ? e.message : 'Vzhľad sa nedá načítať.') }
    finally { if (sequence === readSequence.current) { readLock.current = false; if (!signal?.aborted && live.current) setLoading(false) } }
  }
  function update<K extends keyof ThemeSelection>(key: K, value: ThemeSelection[K]) { setDraft(old => ({ ...old, [key]: value })); setMessage('') }
  function color(key: 'accent' | 'navigation', value: string) {
    setCustom(old => ({ ...old, [key]: value })); setMessage('')
    if (/^#[a-f0-9]{6}$/i.test(value)) update(key, value.toLowerCase())
  }
  async function save() {
    if (saveLock.current || readLock.current || !loaded || mustReload) return
    const parsed = themeSelection.safeParse({ ...draft, ...(draft.scheme === 'custom' ? custom : {}) })
    if (!parsed.success) { setError('Zadajte obe farby v tvare #123456.'); return }
    saveLock.current = true; setSaving(true); setError(''); setMessage('')
    try {
      const next = await themeRequest({ selection: parsed.data, revision: stored.revision })
      if (!live.current) return
      setStored(next); setDraft(next.selection); setCustom({ accent: next.selection.accent, navigation: next.selection.navigation }); setMessage('Váš vzhľad je uložený. Použije sa aj pri ďalšom prihlásení.')
    } catch (e) {
      if (!live.current) return
      setMustReload(true); setError(e instanceof Error ? e.message : 'Výsledok uloženia treba overiť.')
    } finally { saveLock.current = false; if (live.current) setSaving(false) }
  }
  const validCustom = draft.scheme !== 'custom' || /^#[a-f0-9]{6}$/i.test(custom.accent) && /^#[a-f0-9]{6}$/i.test(custom.navigation)
  return <AdminThemeFrame selection={draft}><main className="admin-appearance">
    <header className="admin-page-header"><div><p className="admin-eyebrow">ANASTASIA · Môj pracovný priestor</p><h1>Vzhľad administrácie</h1><p>Vyberte si prostredie, v ktorom sa vám dobre pracuje.</p></div><span className="admin-badge">Len pre váš účet</span></header>
    <p className="admin-info">Meníte svoj pracovný priestor. Vzhľad e-shopu, akadémie ani ďalších webov sa tým nezmení.</p>
    {error && <div ref={errorRef} className="admin-feedback error" role="alert" tabIndex={-1}>{error}</div>}
    {message && <div className="admin-feedback success" role="status">{message}</div>}
    {loading && <p role="status">Načítavame uložený vzhľad…</p>}
    <div className="admin-appearance-grid"><section className="admin-panel" aria-labelledby="appearance-options"><h2 id="appearance-options">Váš motív</h2>
      <fieldset className="admin-theme-options" disabled={loading || saving || !loaded}><legend className="admin-sr">Vyberte motív</legend>{schemes.map(s => {
        const colors = tokensFor({ ...draft, scheme: s.id })
        return <label key={s.id} className={`admin-theme-option ${draft.scheme === s.id ? 'selected' : ''}`}><input type="radio" name="admin-scheme" value={s.id} checked={draft.scheme === s.id} onChange={() => update('scheme', s.id)} /><span className="admin-swatches" aria-hidden="true"><i style={{ background: colors.navigation }} /><i style={{ background: colors.background }} /><i style={{ background: colors.accent }} /></span><span><strong>{s.title}</strong><small>{s.description}</small></span></label>
      })}</fieldset>
      {draft.scheme === 'custom' && <fieldset className="admin-custom-colors" disabled={saving || loading}><legend>Vlastné farby</legend>{(['navigation','accent'] as const).map(key => <div className="admin-color-row" key={key}><label htmlFor={`color-${key}`}>{key === 'navigation' ? 'Navigácia' : 'Hlavné tlačidlá'}</label><input id={`picker-${key}`} aria-label={`Vybrať farbu: ${key === 'navigation' ? 'navigácia' : 'hlavné tlačidlá'}`} type="color" value={draft[key]} onChange={e => color(key, e.target.value)} /><input id={`color-${key}`} type="text" value={custom[key]} onChange={e => color(key, e.target.value)} maxLength={7} spellCheck={false} autoComplete="off" aria-invalid={!/^#[a-f0-9]{6}$/i.test(custom[key])} aria-describedby="color-help" /></div>)}<small id="color-help">Farba vo formáte #123456. Text sa prispôsobí, aby zostal čitateľný.</small></fieldset>}
      <fieldset className="admin-density" disabled={loading || saving || !loaded}><legend>Rozloženie</legend>{[{ value:'comfortable', label:'Vzdušné' },{ value:'compact', label:'Kompaktné' }].map(d => <label key={d.value}><input type="radio" name="admin-density" checked={draft.density===d.value} onChange={() => update('density',d.value as ThemeSelection['density'])} />{d.label}</label>)}</fieldset>
    </section><section className="admin-panel admin-theme-preview" aria-labelledby="theme-preview"><div className="admin-preview-header"><h2 id="theme-preview">Náhľad</h2><span className="admin-badge">Ukážka ovládania</span></div>
      <div className="admin-preview-navigation"><strong>ANASTASIA</strong><span>Váš obchod · Obsah a weby · Nastavenia</span></div>
      <div className="admin-preview-content"><h3>Takto budú vyzerať vaše obrazovky</h3><p>Čitateľné texty, jednotné polia a jasné tlačidlá.</p>
        <label className="admin-field" htmlFor="theme-sample-input"><span>Názov produktu</span><input id="theme-sample-input" defaultValue="Ukážkový produkt" /></label>
        <label className="admin-field" htmlFor="theme-sample-select"><span>Kategória</span><select id="theme-sample-select"><option>Programy</option><option>Kozmetika</option></select></label>
        <div className="admin-preview-actions"><button type="button" className="admin-button primary" onClick={() => setMessage('Toto je iba náhľad tlačidla. Žiadny produkt sa neuložil.')}>Ukážka hlavného tlačidla</button><button type="button" className="admin-button" disabled>Nedostupné tlačidlo</button></div>
        <p className="admin-feedback success">Zrozumiteľné potvrdenie úspechu.</p><p className="admin-feedback error">Zrozumiteľná chyba s ďalším krokom.</p>
      </div>
    </section></div>
    <footer className="admin-appearance-footer"><span>{dirty ? 'Máte neuložený náhľad.' : loaded ? 'Zobrazuje sa uložený vzhľad.' : 'Uložený vzhľad zatiaľ nepoznáme.'}</span><div><button className="admin-button" disabled={loading||saving} onClick={() => { if (!dirty || window.confirm('Načítať uložený vzhľad a zahodiť neuložený náhľad?')) void load() }}>Načítať uložený vzhľad</button><button className="admin-button" disabled={loading||saving||!loaded} onClick={() => { setDraft({ ...DEFAULT_THEME }); setCustom({ accent: DEFAULT_THEME.accent, navigation: DEFAULT_THEME.navigation }); setMessage('Predvolený vzhľad je v náhľade. Zmenu potvrďte uložením.') }}>Predvolený vzhľad</button><button className="admin-button primary" disabled={!loaded||loading||saving||mustReload||!dirty||!validCustom} onClick={() => void save()}>{saving ? 'Ukladáme…' : 'Uložiť môj vzhľad'}</button></div></footer>
  </main></AdminThemeFrame>
}
