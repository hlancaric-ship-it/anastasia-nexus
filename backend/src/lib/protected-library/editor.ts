import { createHash } from 'node:crypto'
import { z } from 'zod'
import { libraryMedia } from './catalog'

export const libraryWrite = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  media: z.array(z.object({
    key: z.string().min(1).max(300),
    title: z.string().trim().min(1).max(200).refine(s => !/[\u0000-\u001f\u007f]/.test(s)),
  }).strict()).max(200),
}).strict()

/** Revision covers the stored registry, not unrelated product fields. */
export function librarySnapshot(metadata: Record<string, unknown> | null | undefined) {
  return {
    media: libraryMedia(metadata),
    revision: createHash('sha256').update(JSON.stringify(metadata?.protected_media ?? [])).digest('hex'),
  }
}

/** This editor may rename/reorder existing files only; never introduce, remove or reassign an object. */
export function sameLibraryKeys(before: ReturnType<typeof librarySnapshot>['media'], next: z.infer<typeof libraryWrite>['media']): boolean {
  const keys = new Set(next.map(m => m.key))
  return before.length === next.length && keys.size === next.length && before.every(m => keys.has(m.key))
}
