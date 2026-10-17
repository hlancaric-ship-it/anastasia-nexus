import { contrast, DEFAULT_THEME, storedTheme, themeSelection, themeWrite, tokensFor } from '../policy'
describe('Admin theme policy', () => {
  it.each(['original','forest','wine','night','custom'] as const)('keeps all text pairs readable in %s', scheme => {
    const t=tokensFor({ ...DEFAULT_THEME, scheme })
    for (const [a,b] of [[t.text,t.background],[t.text,t.surface],[t.text,t.field],[t.muted,t.surface],[t.muted,t.field],[t.accentText,t.accent],[t.navigationText,t.navigation],[t.navigationText,t.navigationEnd],[t.successText,t.successBackground],[t.errorText,t.errorBackground]]) expect(contrast(a,b)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.focus,t.background)).toBeGreaterThanOrEqual(3)
  })
  it('chooses readable text for arbitrary custom colors including mid-gray', () => {
    for(let value=0;value<=255;value++) {
      const color='#'+value.toString(16).padStart(2,'0').repeat(3)
      const t=tokensFor({...DEFAULT_THEME,scheme:'custom',accent:color,navigation:color})
      expect(contrast(t.accentText,color)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.navigationText,color)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('preserves exact original site palette without inheriting unreadable white-on-lavender text', () => {
    const t=tokensFor(DEFAULT_THEME)
    expect(t).toMatchObject({ navigation:'#73729c',navigationEnd:'#a7a5cf',accent:'#184987',background:'#e9e9f2' })
  })
  it.each(['red','#fff','url(https://example.test)','var(--unsafe)','#ffffff;display:none','</style>'])('rejects CSS injection or malformed color %s', accent => expect(themeSelection.safeParse({...DEFAULT_THEME,accent}).success).toBe(false))
  it('rejects target-user fields and invalid revision', () => {
    expect(themeWrite.safeParse({selection:DEFAULT_THEME,revision:0,user_id:'other'}).success).toBe(false)
    expect(themeWrite.safeParse({selection:DEFAULT_THEME,revision:-1}).success).toBe(false)
  })
  it('falls back safely for missing or corrupt preferences', () => {
    expect(storedTheme(null).selection).toEqual(DEFAULT_THEME)
    expect(storedTheme({anastasia_admin_theme:{selection:{...DEFAULT_THEME,accent:'javascript:bad'},revision:1}}).revision).toBe(0)
    expect(storedTheme({anastasia_admin_theme:{selection:DEFAULT_THEME,revision:2.5}}).revision).toBe(0)
  })
})
