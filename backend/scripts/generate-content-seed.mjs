#!/usr/bin/env node
// Generátor obsahového semena pre administráciu.
//
// Prečíta texty zo storefrontu (READ-ONLY – nič vo worktree storefrontu nemení) a vyrobí
// backend/src/lib/content/seed.json: stránky → sekcie → polia (typ, pôvodná hodnota,
// maximálna dĺžka, odporúčaný rozmer obrázka/videa, jazyk).
//
// Použitie:
//   STOREFRONT_DIR=~/anastasia-nexus-codex-storefront-design/storefront-prototype \
//   node scripts/generate-content-seed.mjs
//
// Výstup je fallback: v jadre sa ukladujú iba zmeny, ktoré urobila Lucia.
//
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const STOREFRONT = resolve(
  process.env.STOREFRONT_DIR || join(homedir(), 'anastasia-nexus-codex-storefront-design', 'storefront-prototype'),
)
const OUT = resolve(process.argv[2] || 'src/lib/content/seed.json')

const LIMITS = { text: 160, rich: 2000, longtext: 4000, image: 500, video: 500, link: 500 }
const IMAGE_HINT = 'Odporúčaný rozmer 1600 × 900 px (JPG, PNG alebo WebP, do 2 MB).'
const VIDEO_HINT = 'Odporúčaný rozmer 1920 × 1080 px (MP4, do 20 MB).'

const slug = (path) => {
  const raw = String(path || '').replace(/^\/+|\/+$/g, '')
  return raw.replace(/\//g, '-').replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'home'
}
const keyOf = (page, section, index, type) => `${page}__${section}__${index}-${type}`
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** Legacy bloky → polia. h1/h2/h3 = text, p/ul/ol/table/blockquote = rich, image = image. */
function fieldsFromBlocks(pageKey, sectionKey, blocks, startIndex) {
  const fields = []
  let i = startIndex
  for (const b of blocks) {
    const type = b.type === 'image' ? 'image' : ['h1', 'h2', 'h3'].includes(b.type) ? 'text' : 'rich'
    if (type === 'image') {
      fields.push({
        key: keyOf(pageKey, sectionKey, i, 'image'),
        type: 'image',
        label: `Obrázok ${i + 1}${b.alt ? ` – ${b.alt}` : ''}`,
        value: String(b.src || ''),
        max_length: LIMITS.image,
        lang: 'sk',
        hint: IMAGE_HINT,
        alt: String(b.alt || ''),
      })
    } else {
      const text = String(b.text || '').trim()
      if (!text) { i++; continue }
      const max = text.length > LIMITS.longtext ? LIMITS.longtext : type === 'text' ? LIMITS.text : LIMITS.rich
      fields.push({
        key: keyOf(pageKey, sectionKey, i, type),
        type,
        label: type === 'text' ? `Nadpis ${i + 1}` : `Odsek ${i + 1}`,
        value: text,
        max_length: max,
        lang: 'sk',
      })
      // Odkazy v odseku (tlačidlá v texte) sa dajú upraviť samostatne.
      for (const [li, link] of (b.links || []).entries()) {
        if (!link || !link.href) continue
        fields.push({
          key: keyOf(pageKey, sectionKey, i, `link-${li}`),
          type: 'link',
          label: `Odkaz ${li + 1} – ${link.text || 'bez textu'}`,
          value: String(link.href),
          label_text: String(link.text || ''),
          max_length: LIMITS.link,
          lang: 'sk',
        })
      }
    }
    i++
  }
  return fields
}

/** Stránky z legacy CMS: každé h1 otvára novú sekciu. */
function pagesFromLegacy(legacy) {
  const pages = []
  for (const [path, page] of Object.entries(legacy)) {
    const pageKey = slug(path)
    const blocks = page?.blocks || []
    const sections = []
    let current = null
    let index = 0
    for (const b of blocks) {
      if (b.type === 'h1' || !current) {
        current = { key: `${pageKey}-${sections.length + 1}`, title: String(b.type === 'h1' ? b.text || 'Sekcia' : page?.title || path), order: sections.length, fields: [] }
        sections.push(current)
      }
      current.fields.push(...fieldsFromBlocks(pageKey, current.key, [b], index))
      index++
    }
    pages.push({ key: pageKey, title: String(page?.title || path), path: String(path), sections })
  }
  return pages
}

/** Globálne texty: značka, menu, hlavička, pätička, bočné panely. */
async function globalPage() {
  const menuUrl = pathToFileURL(join(STOREFRONT, 'src/lib/menu-navigation.mjs')).href
  const { menuGroups } = await import(menuUrl)
  const fields = []
  const push = (f) => fields.push(f)
  push({ key: 'global__znacka__0-text', type: 'text', label: 'Názov značky', value: 'ANASTASIA', max_length: LIMITS.text, lang: 'sk' })
  push({ key: 'global__znacka__1-text', type: 'text', label: 'Tagline značky', value: 'LIGHT FOR THE FUTURE', max_length: LIMITS.text, lang: 'sk' })
  push({ key: 'global__znacka__2-text', type: 'text', label: 'Popis v pätičke', value: 'Priestor pre zdravie, poznanie a vedomý život.', max_length: LIMITS.text, lang: 'sk' })
  push({ key: 'global__znacka__3-image', type: 'image', label: 'Logo značky', value: '/assets/brand-mark.svg', max_length: LIMITS.image, lang: 'sk', hint: 'SVG, 512 × 512 px, priehľadné pozadie.' })
  let i = 0
  for (const group of menuGroups) {
    const g = slug(group.title)
    push({ key: `global__menu-${g}__${i}-text`, type: 'text', label: `Nadpis skupiny menu – ${group.title}`, value: group.title, max_length: LIMITS.text, lang: 'sk' })
    push({ key: `global__menu-${g}__${i}-link`, type: 'link', label: `Odkaz skupiny menu – ${group.title}`, value: group.href, max_length: LIMITS.link, lang: 'sk' })
    i++
    for (const [text, href] of group.links || []) {
      push({ key: `global__menu-${g}__${i}-text`, type: 'text', label: `Položka menu – ${text}`, value: text, max_length: LIMITS.text, lang: 'sk' })
      push({ key: `global__menu-${g}__${i}-link`, type: 'link', label: `Odkaz položky menu – ${text}`, value: href, max_length: LIMITS.link, lang: 'sk' })
      i++
    }
  }
  const foot = [
    ['text', 'Pätička – text', '© 2026 ANASTASIA', LIMITS.text],
    ['link', 'Pätička – odkaz Súkromie a GDPR', '/gdpr', LIMITS.link],
    ['link', 'Pätička – odkaz Konzultácie', '/konzultacie', LIMITS.link],
    ['link', 'Pätička – odkaz Kontakt', '/kontakt', LIMITS.link],
    ['text', 'Bočný panel – OBJAVTE ANASTASIA', 'OBJAVTE ANASTASIA', LIMITS.text],
    ['text', 'Bočný panel – LIGHT FOR THE FUTURE', 'LIGHT FOR THE FUTURE', LIMITS.text],
    ['text', 'Hlavička – Obchod', 'Obchod', LIMITS.text],
    ['text', 'Tlačidlo menu – otvoriť', 'Menu', LIMITS.text],
  ]
  foot.forEach(([type, label, value, max], n) => {
    push({ key: `global__paticka__${n}-${type}`, type, label, value, max_length: max, lang: 'sk' })
  })
  push({ key: 'global__video__0-video', type: 'video', label: 'Hero video (domovská stránka)', value: '/media/hero-1080p.mp4', max_length: LIMITS.video, lang: 'sk', hint: VIDEO_HINT })
  return {
    key: 'global',
    title: 'Globálne texty (značka, menu, pätička)',
    path: '/',
    sections: [
      { key: 'znacka', title: 'Značka', order: 0, fields: fields.filter((f) => f.key.includes('__znacka__')) },
      { key: 'menu', title: 'Menu', order: 1, fields: fields.filter((f) => f.key.includes('__menu-')) },
      { key: 'paticka', title: 'Pätička a bočné panely', order: 2, fields: fields.filter((f) => f.key.includes('__paticka__')) },
      { key: 'video', title: 'Videa', order: 3, fields: fields.filter((f) => f.key.includes('__video__')) },
    ],
  }
}

/** Návrhové stránky (domov, obchod): texty zo zdrojových JSONov storefrontu. */
function pageFromDesign(file, pageKey, title, path) {
  const src = readJson(join(STOREFRONT, file))
  const sections = (src.sections || []).map((s, si) => ({
    key: String(s.key),
    title: String(s.title || s.key),
    order: si,
    fields: (s.fields || []).map((f, i) => {
      const type = f.type === 'rich' ? 'rich' : 'text'
      const text = String(f.value || '').trim()
      const max = text.length > LIMITS.longtext ? LIMITS.longtext : type === 'text' ? LIMITS.text : LIMITS.rich
      return {
        key: keyOf(pageKey, String(s.key), i, type),
        type,
        label: type === 'text' ? `Nadpis ${i + 1}` : `Odsek ${i + 1}`,
        value: text,
        max_length: max,
        lang: 'sk',
      }
    }).filter(f => f.value),
  }))
  return { key: pageKey, title, path, sections }
}

const legacy = readJson(join(STOREFRONT, 'src/legacy-content.json'))
const pages = pagesFromLegacy(legacy)
const global = await globalPage()
const home = pageFromDesign('src/home-content.json', 'home', 'Úvod', '/')
const eshop = pageFromDesign('src/eshop-content.json', 'eshop', 'Obchod', '/eshop')
const all = [global, home, eshop, ...pages]
const stats = {
  pages: all.length,
  sections: all.reduce((a, p) => a + p.sections.length, 0),
  fields: all.reduce((a, p) => a + p.sections.reduce((b, s) => b + s.fields.length, 0), 0),
  byType: all.flatMap((p) => p.sections.flatMap((s) => s.fields)).reduce((acc, f) => ({ ...acc, [f.type]: (acc[f.type] || 0) + 1 }), {}),
}
mkdirSync(join(OUT, '..'), { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify({ generated_at: new Date().toISOString(), source: STOREFRONT, stats, pages: all }, null, 1) + '\n',
)
console.log('seed:', OUT, JSON.stringify(stats))
