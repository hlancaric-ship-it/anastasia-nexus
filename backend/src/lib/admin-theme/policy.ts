import { z } from "zod"
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(c => c.toLowerCase())
export const themeSelection = z.object({
  scheme: z.enum(['original', 'forest', 'wine', 'night', 'custom']),
  accent: color,
  navigation: color,
  density: z.enum(['comfortable', 'compact']),
}).strict()
export type ThemeSelection = z.infer<typeof themeSelection>
export const DEFAULT_THEME: ThemeSelection = { scheme: 'original', accent: '#184987', navigation: '#73729c', density: 'comfortable' }
export const themeWrite = z.object({ selection: themeSelection, revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1) }).strict()
export const THEME_METADATA_KEY = 'anastasia_admin_theme'
export type ThemeTokens = {
  background: string; surface: string; field: string; text: string; muted: string; border: string;
  accent: string; accentText: string; navigation: string; navigationEnd: string; navigationText: string; focus: string;
  successBackground: string; successText: string; errorBackground: string; errorText: string;
}
export function luminance(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('INVALID_COLOR')
  const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
  const linear = rgb.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
}
export function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + .05) / (dark + .05)
}
function onColor(color: string) { return contrast(color, '#ffffff') >= contrast(color, '#000000') ? '#ffffff' : '#000000' }
const palettes = {
  original: { background: '#e9e9f2', surface: '#ffffff', field: '#fafafe', text: '#1a1919', muted: '#59595c', border: '#73729c', navigation: '#73729c', accent: '#184987' },
  forest: { background: '#f5f3eb', surface: '#ffffff', field: '#fafaf6', text: '#24392e', muted: '#526054', border: '#78887a', navigation: '#203e33', accent: '#7c2c43' },
  wine: { background: '#fbf5f2', surface: '#ffffff', field: '#fffbf8', text: '#3f2431', muted: '#735563', border: '#947282', navigation: '#502034', accent: '#67402b' },
  night: { background: '#171f24', surface: '#222d34', field: '#18242d', text: '#f4f0e5', muted: '#bdc8c8', border: '#80949d', navigation: '#0e181e', accent: '#e0c58f' },
} as const
export function tokensFor(input: ThemeSelection): ThemeTokens {
  const selection = themeSelection.parse(input)
  const base = palettes[selection.scheme === 'custom' ? 'forest' : selection.scheme]
  const accent = selection.scheme === 'custom' ? selection.accent : base.accent
  const navigation = selection.scheme === 'custom' ? selection.navigation : base.navigation
  return { ...base, accent, navigation, navigationEnd: selection.scheme === 'original' ? '#a7a5cf' : navigation, accentText: onColor(accent), navigationText: onColor(navigation), focus: base.text,
    successBackground: '#e9f0e3', successText: '#25432a', errorBackground: '#fff0ed', errorText: '#762a1d' }
}
export function storedTheme(metadata: Record<string, unknown> | null | undefined) {
  const stored = metadata?.[THEME_METADATA_KEY] as { selection?: unknown; revision?: unknown } | undefined
  const parsed = themeSelection.safeParse(stored?.selection)
  const validRevision = typeof stored?.revision === 'number' && Number.isSafeInteger(stored.revision) && stored.revision >= 0
  // Invalid persisted preferences do not prevent sign-in or inject CSS into the admin.
  const selection = parsed.success && validRevision ? parsed.data : { ...DEFAULT_THEME }
  const revision = parsed.success && validRevision ? stored!.revision as number : 0
  return { selection, revision, tokens: tokensFor(selection) }
}
