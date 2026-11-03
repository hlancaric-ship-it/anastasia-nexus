/**
 * Novinky: príspevky, reklamné plochy partnerov a výsuvný panel na webe.
 * Celý dokument sa ukladá v metadátach obchodu (bez modulu a migrácie) a vždy prechádza validáciou
 * na serveri. Texty sú čistý text bez HTML, adresy len https, médiá len z nášho úložiska.
 */

export const NOVINKY_METADATA_KEY = 'anastasia_novinky'

export const CATEGORIES = [
  { key: 'tip', label: 'Tip' },
  { key: 'pozvanka', label: 'Pozvánka' },
  { key: 'anketa', label: 'Anketa' },
  { key: 'novinka', label: 'Novinka' },
] as const
export type Category = (typeof CATEGORIES)[number]['key']
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as readonly string[]

export const KINDS = ['image', 'video', 'youtube', 'text', 'poll'] as const
export type Kind = (typeof KINDS)[number]

export const LIMITS = {
  posts: 60,
  title: 120,
  excerpt: 300,
  alt: 160,
  linkLabel: 40,
  pollQuestion: 160,
  pollOption: 80,
  pollOptionsMin: 2,
  pollOptionsMax: 6,
  adLabel: 20,
  adTitle: 40,
  adText: 140,
  adButton: 24,
  pageEyebrow: 60,
  pageTitle: 80,
  pageScript: 40,
  pageIntro: 400,
  url: 500,
} as const

export const AD_SLOTS = [1, 2, 3] as const

export type Poll = { question: string; options: Array<{ id: string; label: string }> }

export type Post = {
  id: string
  category: Category
  kind: Kind
  title: string
  excerpt: string
  image_url: string | null
  image_alt: string
  video_url: string | null
  poster_url: string | null
  youtube_id: string | null
  link_url: string | null
  link_label: string
  featured: boolean
  hidden: boolean
  published_at: string
  sort: number
  poll: Poll | null
}

export type Ad = {
  slot: 1 | 2 | 3
  enabled: boolean
  label: string
  title: string
  text: string
  button: string
  url: string | null
  image_url: string | null
  image_alt: string
  active_from: string | null
  active_to: string | null
}

export type PageTexts = {
  eyebrow: string
  title: string
  title_script: string
  intro: string
  partner_label: string
  partner_url: string | null
}

export type Panel = { enabled: boolean; title: string; title_script: string; ad_slot: 1 | 2 | 3 | null }

export type NovinkyDoc = {
  page: PageTexts
  panel: Panel
  posts: Post[]
  ads: Ad[]
  updated_at: string | null
  updated_by: string | null
}

export class NovinkyValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NovinkyValidationError'
  }
}

const fail = (message: string): never => {
  throw new NovinkyValidationError(message)
}

export const DEFAULT_PAGE: PageTexts = {
  eyebrow: 'Čo je nové',
  title: 'Naše',
  title_script: 'novinky',
  intro: 'Tipy, pozvánky a novinky zo sveta ANASTASIA na jednom mieste.',
  partner_label: 'Chcem sa stať partnerom',
  partner_url: null,
}
export const DEFAULT_PANEL: Panel = { enabled: true, title: 'Naše', title_script: 'novinky', ad_slot: 1 }

export function emptyDoc(): NovinkyDoc {
  return {
    page: { ...DEFAULT_PAGE },
    panel: { ...DEFAULT_PANEL },
    posts: [],
    ads: AD_SLOTS.map((slot) => emptyAd(slot)),
    updated_at: null,
    updated_by: null,
  }
}

function emptyAd(slot: 1 | 2 | 3): Ad {
  return { slot, enabled: false, label: 'Reklama', title: '', text: '', button: 'Zistiť viac', url: null, image_url: null, image_alt: '', active_from: null, active_to: null }
}

// --- čistý text ---

// Riadiace znaky okrem nového riadku, neviditeľné smerové znaky (podvrhnutie textu).
const CONTROL_RE = /[\u0000-\u0009\u000B-\u001F\u007F‎‏‪-‮⁦-⁩]/g

/** Čistý text: bez HTML značiek, bez riadiacich znakov, orezaný na limit (dĺžka sa kontroluje, nie skracuje). */
export function cleanText(value: unknown, max: number, label: string, { multiline = false } = {}): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') fail(`${label}: očakáva sa text.`)
  let text = (value as string).replace(/\r\n?/g, '\n').replace(CONTROL_RE, '')
  text = multiline ? text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n') : text.replace(/\n+/g, ' ')
  text = text.trim()
  if (/<\s*\/?\s*[a-z!][^>]*>/i.test(text)) fail(`${label}: text nesmie obsahovať HTML značky.`)
  if ([...text].length > max) fail(`${label}: najviac ${max} znakov.`)
  return text
}

// --- adresy ---

/** Odkaz von (tlačidlo, reklama): len https bez prihlasovacích údajov. */
export function cleanLinkUrl(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') fail(`${label}: neplatná adresa.`)
  const raw = (value as string).trim()
  if (!raw) return null
  if (raw.length > LIMITS.url) fail(`${label}: adresa je príliš dlhá.`)
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    if (!/^\/[A-Za-z0-9._~\-/%?#=&+]*$/.test(raw)) fail(`${label}: neplatná adresa.`)
    return raw
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return fail(`${label}: neplatná adresa.`)
  }
  if (url.protocol !== 'https:') fail(`${label}: adresa musí začínať na https://.`)
  if (url.username || url.password) fail(`${label}: adresa nesmie obsahovať prihlasovacie údaje.`)
  return url.toString()
}

/** Povolené zdroje médií: verejné úložisko súborov (S3_FILE_URL) a adresy z knižnice Médiá. */
export function mediaOrigins(env: NodeJS.ProcessEnv, libraryUrls: string[]): Set<string> {
  const origins = new Set<string>()
  const add = (value: unknown) => {
    try {
      const url = new URL(String(value || ''))
      if (url.protocol === 'https:') origins.add(url.origin)
      else if (url.protocol === 'http:' && env.NODE_ENV !== 'production' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) origins.add(url.origin)
    } catch {
      /* neplatná adresa sa ignoruje */
    }
  }
  add(env.S3_FILE_URL)
  for (const url of libraryUrls) add(url)
  return origins
}

export function cleanMediaUrl(value: unknown, origins: Set<string>, label: string, kind: 'image' | 'video'): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') fail(`${label}: neplatná adresa.`)
  const raw = (value as string).trim()
  if (!raw) return null
  if (raw.length > LIMITS.url) fail(`${label}: adresa je príliš dlhá.`)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return fail(`${label}: neplatná adresa.`)
  }
  if (url.username || url.password || !origins.has(url.origin)) {
    fail(`${label}: ${kind === 'video' ? 'video' : 'obrázok'} nahrajte cez administráciu alebo vyberte z Médií.`)
  }
  const path = url.pathname.toLowerCase()
  if (kind === 'video' && !/\.(mp4|m4v|webm)$/.test(path)) fail(`${label}: video musí byť MP4 alebo WEBM.`)
  if (kind === 'image' && !/\.(jpe?g|png|webp|gif|avif)$/.test(path)) fail(`${label}: obrázok musí byť JPG, PNG, WebP, GIF alebo AVIF.`)
  return url.toString()
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

/** YouTube: prijme ID alebo bežné tvary odkazu, uloží sa len 11-znakové ID. */
export function parseYoutubeId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (YOUTUBE_ID_RE.test(raw)) return raw
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.replace(/^(www\.|m\.)/, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)
      id = m ? m[1] : null
    }
  }
  return id && YOUTUBE_ID_RE.test(id) ? id : null
}

// --- dátumy ---

function cleanDate(value: unknown, label: string, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label}: zadajte dátum.`)
    return null
  }
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) fail(`${label}: neplatný dátum.`)
  const year = date.getUTCFullYear()
  if (year < 2020 || year > 2100) fail(`${label}: dátum mimo rozsahu.`)
  return date.toISOString()
}

// --- dokument ---

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: neplatné údaje.`)
  return value as Record<string, unknown>
}

function cleanPoll(value: unknown, index: number, previous: Poll | null): Poll {
  const label = `Anketa v príspevku ${index + 1}`
  const raw = asObject(value, label)
  const question = cleanText(raw.question, LIMITS.pollQuestion, `${label} – otázka`)
  if (!Array.isArray(raw.options)) fail(`${label}: doplňte možnosti.`)
  const options = (raw.options as unknown[]).map((option, i) => {
    const o = asObject(option, `${label} – možnosť ${i + 1}`)
    const text = cleanText(o.label, LIMITS.pollOption, `${label} – možnosť ${i + 1}`)
    if (!text) fail(`${label}: možnosť ${i + 1} je prázdna.`)
    const id = typeof o.id === 'string' && /^o[0-9]{1,3}$/.test(o.id) ? o.id : ''
    return { id, label: text }
  })
  if (options.length < LIMITS.pollOptionsMin || options.length > LIMITS.pollOptionsMax) {
    fail(`${label}: ${LIMITS.pollOptionsMin} až ${LIMITS.pollOptionsMax} možnosti.`)
  }
  // Identifikátor možnosti sa nikdy nepridelí znova inej odpovedi, inak by sa jej pripísali staré hlasy.
  const used = new Set<string>()
  let next = 1
  for (const id of (previous?.options ?? []).map((o) => o.id)) next = Math.max(next, Number(id.slice(1)) + 1)
  for (const option of options) {
    if (!option.id || used.has(option.id)) option.id = `o${next++}`
    used.add(option.id)
  }
  return { question, options }
}

function cleanPost(value: unknown, index: number, origins: Set<string>, previous: Map<string, Post>, now: string): Post {
  const label = `Príspevok ${index + 1}`
  const raw = asObject(value, label)
  const category = String(raw.category ?? '')
  if (!CATEGORY_KEYS.includes(category)) fail(`${label}: vyberte rubriku.`)
  const kind = String(raw.kind ?? '') as Kind
  if (!(KINDS as readonly string[]).includes(kind)) fail(`${label}: vyberte typ príspevku.`)
  const title = cleanText(raw.title, LIMITS.title, `${label} – nadpis`)
  if (!title) fail(`${label}: doplňte nadpis.`)
  const id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : ''
  const before = id ? previous.get(id) ?? null : null
  const post: Post = {
    id,
    category: category as Category,
    kind,
    title,
    excerpt: cleanText(raw.excerpt, LIMITS.excerpt, `${label} – text`, { multiline: true }),
    image_url: cleanMediaUrl(raw.image_url, origins, `${label} – obrázok`, 'image'),
    image_alt: cleanText(raw.image_alt, LIMITS.alt, `${label} – popis obrázka`),
    video_url: null,
    poster_url: null,
    youtube_id: null,
    link_url: cleanLinkUrl(raw.link_url, `${label} – odkaz`),
    link_label: cleanText(raw.link_label, LIMITS.linkLabel, `${label} – text tlačidla`),
    featured: raw.featured === true,
    hidden: raw.hidden === true,
    published_at: cleanDate(raw.published_at, `${label} – dátum zverejnenia`, false) ?? before?.published_at ?? now,
    sort: Number.isInteger(raw.sort) && Math.abs(raw.sort as number) <= 10_000 ? (raw.sort as number) : index,
    poll: null,
  }
  if (kind === 'image' && !post.image_url) fail(`${label}: pridajte fotografiu.`)
  if (kind === 'video') {
    post.video_url = cleanMediaUrl(raw.video_url, origins, `${label} – video`, 'video')
    if (!post.video_url) fail(`${label}: nahrajte video.`)
    post.poster_url = cleanMediaUrl(raw.poster_url, origins, `${label} – úvodný obrázok videa`, 'image')
  }
  if (kind === 'youtube') {
    post.youtube_id = parseYoutubeId(raw.youtube_id)
    if (!post.youtube_id) fail(`${label}: vložte platný odkaz na YouTube.`)
  }
  if (kind === 'poll') post.poll = cleanPoll(raw.poll, index, before?.poll ?? null)
  if (kind === 'text' && !post.excerpt) fail(`${label}: doplňte text.`)
  if (post.link_label && !post.link_url) fail(`${label}: tlačidlo potrebuje odkaz.`)
  return post
}

function cleanAd(value: unknown, slot: 1 | 2 | 3, origins: Set<string>): Ad {
  const label = `Reklamná plocha ${slot}`
  const raw = value === undefined || value === null ? {} : asObject(value, label)
  const ad: Ad = {
    slot,
    enabled: raw.enabled === true,
    label: cleanText(raw.label, LIMITS.adLabel, `${label} – štítok`) || 'Reklama',
    title: cleanText(raw.title, LIMITS.adTitle, `${label} – nadpis`),
    text: cleanText(raw.text, LIMITS.adText, `${label} – text`),
    button: cleanText(raw.button, LIMITS.adButton, `${label} – tlačidlo`) || 'Zistiť viac',
    url: cleanLinkUrl(raw.url, `${label} – odkaz`),
    image_url: cleanMediaUrl(raw.image_url, origins, `${label} – obrázok`, 'image'),
    image_alt: cleanText(raw.image_alt, LIMITS.alt, `${label} – popis obrázka`),
    active_from: cleanDate(raw.active_from, `${label} – zobraziť od`, false),
    active_to: cleanDate(raw.active_to, `${label} – zobraziť do`, false),
  }
  if (ad.active_from && ad.active_to && ad.active_from > ad.active_to) fail(`${label}: dátum „do“ je skôr ako „od“.`)
  if (ad.enabled && (!ad.title || !ad.url || !ad.image_url)) fail(`${label}: zapnutá plocha potrebuje nadpis, obrázok a odkaz.`)
  return ad
}

/**
 * Overí celý dokument z administrácie. Vyhodí NovinkyValidationError so slovenskou hláškou pre Luciu.
 * `previous` je uložený stav: zachovajú sa identifikátory príspevkov a možností ankiet (kvôli hlasom).
 */
export function validateDoc(input: unknown, opts: { origins: Set<string>; previous: NovinkyDoc; now?: Date }): Omit<NovinkyDoc, 'updated_at' | 'updated_by'> {
  const raw = asObject(input, 'Novinky')
  const now = (opts.now ?? new Date()).toISOString()
  const pageRaw = raw.page === undefined ? {} : asObject(raw.page, 'Texty stránky')
  const page: PageTexts = {
    eyebrow: cleanText(pageRaw.eyebrow, LIMITS.pageEyebrow, 'Stránka – nadtitulok'),
    title: cleanText(pageRaw.title, LIMITS.pageTitle, 'Stránka – nadpis'),
    title_script: cleanText(pageRaw.title_script, LIMITS.pageScript, 'Stránka – slovo písaným písmom'),
    intro: cleanText(pageRaw.intro, LIMITS.pageIntro, 'Stránka – úvodný text', { multiline: true }),
    partner_label: cleanText(pageRaw.partner_label, LIMITS.linkLabel, 'Stránka – text pre partnerov'),
    partner_url: cleanLinkUrl(pageRaw.partner_url, 'Stránka – odkaz pre partnerov'),
  }
  if (page.partner_label && !page.partner_url) fail('Stránka: tlačidlo pre partnerov potrebuje odkaz.')

  const panelRaw = raw.panel === undefined ? {} : asObject(raw.panel, 'Výsuvný panel')
  const slot = panelRaw.ad_slot === null || panelRaw.ad_slot === undefined || panelRaw.ad_slot === '' ? null : Number(panelRaw.ad_slot)
  if (slot !== null && !(AD_SLOTS as readonly number[]).includes(slot)) fail('Výsuvný panel: neplatná reklamná plocha.')
  const panel: Panel = {
    enabled: panelRaw.enabled !== false,
    title: cleanText(panelRaw.title, LIMITS.pageTitle, 'Výsuvný panel – nadpis'),
    title_script: cleanText(panelRaw.title_script, LIMITS.pageScript, 'Výsuvný panel – slovo písaným písmom'),
    ad_slot: slot as Panel['ad_slot'],
  }

  if (!Array.isArray(raw.posts)) fail('Príspevky: neplatné údaje.')
  const postsRaw = raw.posts as unknown[]
  if (postsRaw.length > LIMITS.posts) fail(`Najviac ${LIMITS.posts} príspevkov. Staré príspevky zmažte alebo skryte.`)
  const previous = new Map(opts.previous.posts.map((p) => [p.id, p]))
  const posts = postsRaw.map((p, i) => cleanPost(p, i, opts.origins, previous, now))
  const ids = new Set<string>()
  let seq = 1
  for (const post of posts) {
    if (post.id && ids.has(post.id)) post.id = ''
    while (!post.id) {
      const candidate = `p${Date.parse(now).toString(36)}-${seq++}`
      if (!ids.has(candidate) && !previous.has(candidate)) post.id = candidate
    }
    ids.add(post.id)
  }
  if (posts.filter((p) => p.featured).length > 1) fail('Hlavný príspevok môže byť len jeden.')

  if (raw.ads !== undefined && !Array.isArray(raw.ads)) fail('Reklamné plochy: neplatné údaje.')
  const adsRaw = (raw.ads as unknown[] | undefined) ?? []
  if (adsRaw.length > AD_SLOTS.length) fail('Reklamné plochy: najviac tri.')
  const bySlot = new Map<number, unknown>()
  for (const ad of adsRaw) {
    const s = Number((ad as Record<string, unknown> | null)?.slot)
    if (!(AD_SLOTS as readonly number[]).includes(s) || bySlot.has(s)) fail('Reklamné plochy: neplatné číslo plochy.')
    bySlot.set(s, ad)
  }
  const ads = AD_SLOTS.map((s) => cleanAd(bySlot.get(s), s, opts.origins))
  return { page, panel, posts, ads }
}

// --- čítanie uloženého stavu ---

/** Uložený dokument. Poškodený alebo starý tvar sa nevráti potichu: neplatné časti sa vynechajú. */
export function readDoc(metadata: unknown): NovinkyDoc {
  const source = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  const raw = source[NOVINKY_METADATA_KEY]
  const doc = emptyDoc()
  if (!raw || typeof raw !== 'object') return doc
  const stored = raw as Record<string, unknown>
  const page = stored.page && typeof stored.page === 'object' ? (stored.page as Record<string, unknown>) : {}
  for (const key of Object.keys(DEFAULT_PAGE) as Array<keyof PageTexts>) {
    const value = page[key]
    if (typeof value === 'string' || (key === 'partner_url' && value === null)) (doc.page as Record<string, unknown>)[key] = value
  }
  const panel = stored.panel && typeof stored.panel === 'object' ? (stored.panel as Record<string, unknown>) : {}
  if (typeof panel.enabled === 'boolean') doc.panel.enabled = panel.enabled
  if (typeof panel.title === 'string') doc.panel.title = panel.title
  if (typeof panel.title_script === 'string') doc.panel.title_script = panel.title_script
  if (panel.ad_slot === null || (AD_SLOTS as readonly unknown[]).includes(panel.ad_slot)) doc.panel.ad_slot = panel.ad_slot as Panel['ad_slot']
  if (Array.isArray(stored.posts)) {
    doc.posts = stored.posts.filter((p): p is Post => {
      const post = p as Post
      return !!post && typeof post === 'object' && typeof post.id === 'string' && CATEGORY_KEYS.includes(post.category)
        && (KINDS as readonly string[]).includes(post.kind) && typeof post.title === 'string' && typeof post.published_at === 'string'
    }).slice(0, LIMITS.posts)
  }
  if (Array.isArray(stored.ads)) {
    for (const ad of stored.ads as Ad[]) {
      if (ad && typeof ad === 'object' && (AD_SLOTS as readonly number[]).includes(ad.slot)) doc.ads[ad.slot - 1] = { ...emptyAd(ad.slot), ...ad }
    }
  }
  doc.updated_at = typeof stored.updated_at === 'string' ? stored.updated_at : null
  doc.updated_by = typeof stored.updated_by === 'string' ? stored.updated_by : null
  return doc
}

export function writeDoc(metadata: unknown, doc: NovinkyDoc): Record<string, unknown> {
  const source = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  return { ...source, [NOVINKY_METADATA_KEY]: doc }
}

/** Revízia pre ochranu pred súbežným ukladaním (dvaja ľudia v administrácii naraz). */
export const docRevision = (doc: NovinkyDoc): string => doc.updated_at || 'initial'

// --- verejný pohľad pre web ---

export type PublicPoll = { question: string; options: Array<{ id: string; label: string; votes: number }>; total: number }
export type Votes = Map<string, number>

export const voteKey = (postId: string, optionId: string) => `novinky-poll:${postId}:${optionId}`
export const clickKey = (slot: number) => `novinky-ad-click:${slot}`

export function isAdActive(ad: Ad, now: Date): boolean {
  if (!ad.enabled || !ad.title || !ad.url || !ad.image_url) return false
  const t = now.toISOString()
  return (!ad.active_from || ad.active_from <= t) && (!ad.active_to || ad.active_to >= t)
}

export function isPostVisible(post: Post, now: Date): boolean {
  return !post.hidden && post.published_at <= now.toISOString()
}

export function publicPoll(post: Post, votes: Votes): PublicPoll | null {
  if (post.kind !== 'poll' || !post.poll) return null
  const options = post.poll.options.map((o) => ({ id: o.id, label: o.label, votes: votes.get(voteKey(post.id, o.id)) ?? 0 }))
  return { question: post.poll.question, options, total: options.reduce((sum, o) => sum + o.votes, 0) }
}

function publicPost(post: Post, votes: Votes) {
  return {
    id: post.id,
    category: post.category,
    kind: post.kind,
    title: post.title,
    excerpt: post.excerpt,
    image_url: post.image_url,
    image_alt: post.image_alt,
    video_url: post.kind === 'video' ? post.video_url : null,
    poster_url: post.kind === 'video' ? post.poster_url : null,
    youtube_id: post.kind === 'youtube' ? post.youtube_id : null,
    link_url: post.link_url,
    link_label: post.link_url ? post.link_label || 'Čítať ďalej' : '',
    published_at: post.published_at,
    poll: publicPoll(post, votes),
  }
}

function publicAd(ad: Ad) {
  return { slot: ad.slot, label: ad.label, title: ad.title, text: ad.text, button: ad.button, url: ad.url, image_url: ad.image_url, image_alt: ad.image_alt }
}

export function publicView(doc: NovinkyDoc, votes: Votes, now: Date = new Date()) {
  const visible = doc.posts
    .filter((p) => isPostVisible(p, now))
    .sort((a, b) => a.sort - b.sort || (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0))
  const featured = visible.find((p) => p.featured) ?? null
  const ads = doc.ads.filter((ad) => isAdActive(ad, now))
  const panelAd = doc.panel.ad_slot ? ads.find((ad) => ad.slot === doc.panel.ad_slot) ?? null : null
  return {
    page: { ...doc.page, partner_label: doc.page.partner_url ? doc.page.partner_label : '' },
    categories: CATEGORIES.map((c) => ({ ...c })),
    featured: featured ? publicPost(featured, votes) : null,
    posts: visible.filter((p) => p !== featured).map((p) => publicPost(p, votes)),
    ads: ads.map(publicAd),
    panel: { enabled: doc.panel.enabled, title: doc.panel.title, title_script: doc.panel.title_script, ad: panelAd ? publicAd(panelAd) : null },
    updated_at: doc.updated_at,
  }
}
