/**
 * Pravidlá pre nahrávanie hero videa (global__video) v administrácii.
 *
 * Prijíma sa len video vo formátoch mp4 a webm (1080p / 720p / 480p) a poster
 * (JPG, PNG, WebP). Súbor s iným typom alebo príliš veľký server odmietne
 * s prehľadnou hláškou – nie tichou chybou.
 */
export const HERO_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const
export const HERO_POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Povolené rozmery (orientácia na šírku) a súvisiace koncové formáty. */
export const HERO_VIDEO_VARIANTS = [
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: '480p', width: 854, height: 480 },
] as const

export const HERO_VIDEO_MAX_SIZE = 25 * 1024 * 1024
export const HERO_POSTER_MAX_SIZE = 5 * 1024 * 1024

const list = (items: readonly string[]) => items.join(', ')

/** Súbor, ktorý patrí medzi video (nie poster). */
export const isHeroVideo = (file: { type?: string }) =>
  (HERO_VIDEO_TYPES as readonly string[]).includes(String(file.type || ''))

/** Súbor, ktorý patrí medzi poster (nie video). */
export const isHeroPoster = (file: { type?: string }) =>
  (HERO_POSTER_TYPES as readonly string[]).includes(String(file.type || ''))

/**
 * Skontroluje typ a veľkosť nahrávaného súboru.
 * Vracia chybovú hlášku, alebo null, ak je súbor v poriadku.
 */
export function checkHeroUpload(
  file: { name?: string; type?: string; size?: number },
  kind: 'video' | 'poster' = 'video',
): string | null {
  const name = file.name || 'súbor'
  const type = String(file.type || '')
  const size = Number(file.size) || 0
  if (kind === 'poster') {
    if (!isHeroPoster(file)) {
      return `Poster musí byť obrázok (${list(HERO_POSTER_TYPES)}), „${name}“ má typ ${type || 'neznámy'}.`
    }
    if (size > HERO_POSTER_MAX_SIZE) {
      return `Poster je príliš veľký (maximálne ${Math.round(HERO_POSTER_MAX_SIZE / 1024 / 1024)} MB), „${name}“ má ${Math.round(size / 1024 / 1024)} MB.`
    }
    return null
  }
  if (!isHeroVideo(file)) {
    return `Video musí byť MP4 alebo WEBM (${list(HERO_VIDEO_TYPES)}), „${name}“ má typ ${type || 'neznámy'}.`
  }
  if (size > HERO_VIDEO_MAX_SIZE) {
    return `Video je príliš veľké (maximálne ${Math.round(HERO_VIDEO_MAX_SIZE / 1024 / 1024)} MB), „${name}“ má ${Math.round(size / 1024 / 1024)} MB.`
  }
  return null
}

/** Rozmer, ktorý sa akceptuje pre video (presná zhoda s jedným z variantov). */
export function heroVideoVariant(width: number, height: number): (typeof HERO_VIDEO_VARIANTS)[number] | null {
  return HERO_VIDEO_VARIANTS.find(v => v.width === width && v.height === height) ?? null
}
