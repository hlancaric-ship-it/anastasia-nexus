import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { DEFAULT_THEME, themeSelection, tokensFor, type ThemeSelection } from '../../lib/admin-theme/policy'
import './admin-theme.css'
export type ThemeState = { selection: ThemeSelection; revision: number }
export const defaultState: ThemeState = { selection: { ...DEFAULT_THEME }, revision: 0 }
export async function themeRequest(body?: ThemeState, signal?: AbortSignal): Promise<ThemeState> {
  let response: Response
  try {
    response = await fetch('/admin/my-theme', { credentials: 'include', method: body ? 'POST' : 'GET', cache: 'no-store', redirect: 'error', signal,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  } catch (e) { if (signal?.aborted) throw e; throw new Error(body ? 'Výsledok uloženia nepoznáme. Načítajte uložený vzhľad pred ďalším pokusom.' : 'Spojenie sa prerušilo. Skúste načítať vzhľad znova.') }
  if (!response.ok) {
    const errors: Record<number, string> = { 400: 'Skontrolujte zvolený motív a farby.', 401: 'Prihlásenie vypršalo. Prihláste sa do administrácie znova.', 403: 'Na túto zmenu nemáte oprávnenie.', 409: 'Vzhľad ste medzičasom zmenili v inom okne. Najprv načítajte uložený vzhľad.', 429: 'Chvíľu počkajte a potom skúste znova.' }
    throw new Error(errors[response.status] ?? (body ? 'Výsledok uloženia treba overiť. Načítajte uložený vzhľad pred ďalším pokusom.' : 'Vzhľad sa teraz nedá načítať. Skúste to neskôr.'))
  }
  try {
    const data = await response.json()
    const selection = themeSelection.parse(data.selection)
    if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('INVALID_THEME_REVISION')
    return { selection, revision: data.revision }
  } catch { throw new Error('Server nevrátil očakávaný vzhľad. Načítajte uložené údaje znova.') }
}
/** Shared by every new bespoke admin screen. No effect on customer sites or native legacy screens. */
export function AdminThemeFrame({ selection, children }: { selection: ThemeSelection; children: ReactNode }) {
  const vars = Object.fromEntries(Object.entries(tokensFor(selection)).map(([key, value]) => [`--admin-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value]))
  return <div className="anastasia-admin" data-density={selection.density} data-theme={selection.scheme} style={vars as CSSProperties}>{children}</div>
}
export function useAdminTheme() {
  const [theme, setTheme] = useState(defaultState), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    void themeRequest(undefined, controller.signal).then(value => { if (!controller.signal.aborted) setTheme(value) })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Vzhľad sa nepodarilo načítať.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  return { ...theme, loading, error }
}
