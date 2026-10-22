/**
 * Uloženie zmien obsahu webu (prepisky textov) v metadátach obchodu.
 * Ukladáme iba rozdiely oproti seedu – pôvodné znenie zostáva vždy dostupné.
 */
import { readStore, writeStoreMetadata } from '../pages/store'
import { CONTENT_MAX_HISTORY, type ContentOverrides, type ContentVersion } from './policy'

export const CONTENT_METADATA_KEY = 'anastasia_content'

export function readContentOverrides(metadata: unknown): ContentOverrides {
  const source = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  const raw = source[CONTENT_METADATA_KEY]
  const fields: ContentOverrides['fields'] = {}
  if (raw && typeof raw === 'object') {
    // Formát v metadátach: { fields: { <key>: { value, updated_at, updated_by, history } } }
    const container = (raw as Record<string, unknown>).fields && typeof (raw as Record<string, unknown>).fields === 'object'
      ? (raw as Record<string, unknown>).fields as Record<string, unknown>
      : raw as Record<string, unknown>
    for (const [key, value] of Object.entries(container)) {
      if (!value || typeof value !== 'object') continue
      const entry = value as Record<string, unknown>
      if (typeof entry.value !== 'string') continue
      fields[key] = {
        value: entry.value,
        updated_at: typeof entry.updated_at === 'string' ? entry.updated_at : '',
        updated_by: typeof entry.updated_by === 'string' ? entry.updated_by : '',
        history: Array.isArray(entry.history)
          ? (entry.history as unknown[]).filter((h): h is ContentVersion =>
              !!h && typeof h === 'object' && typeof (h as ContentVersion).value === 'string')
          : [],
      }
    }
  }
  return { fields }
}

export function writeContentOverrides(metadata: unknown, overrides: ContentOverrides): Record<string, unknown> {
  const source = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  return { ...source, [CONTENT_METADATA_KEY]: overrides }
}

/** Zapíše novú hodnotu poľa a zachová posledné verzie. */
export function applyFieldChange(overrides: ContentOverrides, fieldKey: string, value: string, actor: string, now = new Date()): ContentOverrides {
  const current = overrides.fields[fieldKey]
  const history = [...(current?.history ?? []), ...(current ? [{ value: current.value, updated_at: current.updated_at, updated_by: current.updated_by }] : [])]
    .slice(-CONTENT_MAX_HISTORY)
  return {
    fields: {
      ...overrides.fields,
      [fieldKey]: { value, updated_at: now.toISOString(), updated_by: actor, history },
    },
  }
}
