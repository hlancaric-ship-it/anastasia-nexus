/**
 * Obsah webu – model page → sections → fields.
 *
 * Zdroj textov je seed (`seed.json`, vygenerovaný zo storefrontu – pozri
 * `scripts/generate-content-seed.mjs`). Seed je ZÁLOHA (fallback): v jadre sa ukladajú
 * iba zmeny, ktoré urobila Lucia, takže pôvodné znenie zostáva vždy dostupné.
 *
 * Dizajn (layout, farby, písmo) sem nepatrí – to je pevne dané v storefronte.
 */
import seedJson from './seed.json'

export type ContentFieldType = 'text' | 'rich' | 'image' | 'video' | 'link'

export type ContentField = {
  key: string
  type: ContentFieldType
  label: string
  /** Aktuálna hodnota (zmenená alebo fallback). */
  value: string
  /** Pôvodná hodnota zo seeda. */
  fallback: string
  max_length: number
  lang: 'sk' | 'en' | 'ru'
  hint?: string
  alt?: string
  label_text?: string
  width?: number
  height?: number
  /** true = hodnota sa líši od pôvodného znenia. */
  changed?: boolean
  updated_at?: string | null
  updated_by?: string | null
  /** Verzie hodnoty (posledné zmeny) – umožňujú vrátiť staršiu verziu. */
  history?: ContentVersion[]
}

export type ContentVersion = { value: string; updated_at: string; updated_by: string }

export type ContentSection = {
  key: string
  title: string
  order: number
  fields: ContentField[]
}

export type ContentPage = {
  key: string
  title: string
  path: string
  sections: ContentSection[]
}

export type ContentOverrides = {
  fields: Record<string, { value: string; updated_at: string; updated_by: string; history: ContentVersion[] }>
}

const seed = seedJson as unknown as { pages: Array<{ key: string; title: string; path: string; sections: Array<{ key: string; title: string; order: number; fields: Array<Record<string, unknown>> }> }> }

export const CONTENT_LANGS = ['sk', 'en', 'ru'] as const
export const CONTENT_MAX_HISTORY = 20

/** Všetky stránky zo seeda (bez zmien). */
export function seedPages(): ContentPage[] {
  return seed.pages.map((page) => ({
    key: page.key,
    title: page.title,
    path: page.path,
    sections: page.sections.map((section) => ({
      key: section.key,
      title: section.title,
      order: section.order,
      fields: (section.fields || []).map((field) => ({
        key: String(field.key),
        type: String(field.type || 'text') as ContentFieldType,
        label: String(field.label || field.key),
        value: String(field.value ?? ''),
        fallback: String(field.value ?? ''),
        max_length: Number(field.max_length) || 2000,
        lang: (CONTENT_LANGS.includes(field.lang as any) ? field.lang : 'sk') as 'sk' | 'en' | 'ru',
        hint: field.hint ? String(field.hint) : undefined,
        alt: field.alt ? String(field.alt) : undefined,
        label_text: field.label_text ? String(field.label_text) : undefined,
        width: field.width ? Number(field.width) : undefined,
        height: field.height ? Number(field.height) : undefined,
      })),
    })),
  }))
}

export function seedPage(key: string): ContentPage | null {
  return seedPages().find((p) => p.key === key) ?? null
}

export function findSeedField(pageKey: string, fieldKey: string): { page: ContentPage; section: ContentSection; field: ContentField } | null {
  const page = seedPage(pageKey)
  if (!page) return null
  for (const section of page.sections) {
    const field = section.fields.find((f) => f.key === fieldKey)
    if (field) return { page, section, field }
  }
  return null
}

/** Preverí novú hodnotu poľa (typ, dĺžka, jazyk). */
export function validateFieldValue(field: ContentField, value: unknown): { ok: true; value: string } | { ok: false; message: string } {
  const text = String(value ?? '')
  if (text.length > field.max_length) {
    return { ok: false, message: `Text je príliš dlhý (maximálne ${field.max_length} znakov, teraz ${text.length}).` }
  }
  if (field.type === 'link' && text && !/^(https?:\/\/|\/|mailto:|tel:)/i.test(text.trim())) {
    return { ok: false, message: 'Odkaz musí začínať na https://, / alebo mailto:.' }
  }
  if (field.type === 'image' && text && !/^(https?:\/\/|\/)/i.test(text.trim())) {
    return { ok: false, message: 'Adresa obrázka musí začínať na https:// alebo /.' }
  }
  if (field.type === 'video' && text && !/^(https?:\/\/|\/)/i.test(text.trim())) {
    return { ok: false, message: 'Adresa videa musí začínať na https:// alebo /.' }
  }
  return { ok: true, value: text }
}

/** Sklopí seed so zmenami – hodnota bez zmeny padá na pôvodný text. */
export function mergeContent(overrides: ContentOverrides): ContentPage[] {
  return seedPages().map((page) => ({
    ...page,
    sections: page.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        const override = overrides?.fields?.[field.key]
        if (!override) return { ...field, changed: false, updated_at: null, updated_by: null, history: [] }
        const changed = override.value !== field.fallback
        return {
          ...field,
          value: changed ? override.value : field.fallback,
          changed,
          updated_at: override.updated_at ?? null,
          updated_by: override.updated_by ?? null,
          history: override.history ?? [],
        }
      }),
    })),
  }))
}
