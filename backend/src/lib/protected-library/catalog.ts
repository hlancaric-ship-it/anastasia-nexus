export type LibraryMedia = { key: string; title: string; kind: "audio" | "video" | "document" }

/** Only exact object keys registered by an administrator, never arbitrary URLs or directory grants. */
export function libraryMedia(metadata: Record<string, unknown> | null | undefined): LibraryMedia[] {
  const raw = metadata?.protected_media
  if (!Array.isArray(raw)) return []
  const result: LibraryMedia[] = [], seen = new Set<string>()
  for (const value of raw.slice(0, 200)) {
    const item = typeof value === "string" ? { key: value } : value
    const key = item?.key
    if (typeof key !== "string" || !key || key.length > 300 || /[\\\u0000-\u001f\u007f?#]/.test(key) || key.startsWith("/") || key.split("/").some(s => ["", ".", ".."].includes(s)) || seen.has(key)) continue
    const extension = key.split(".").pop()?.toLowerCase()
    const kind = extension === "pdf" ? "document" : ["mp3", "m4a", "aac", "wav", "ogg"].includes(extension || "") ? "audio" : ["mp4", "webm", "m3u8"].includes(extension || "") ? "video" : null
    if (!kind) continue
    const title = typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 200) : key.split("/").pop()!
    seen.add(key); result.push({ key, title, kind })
  }
  return result
}
