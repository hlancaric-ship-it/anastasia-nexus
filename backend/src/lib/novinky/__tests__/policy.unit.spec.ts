import {
  NovinkyValidationError, cleanLinkUrl, cleanText, emptyDoc, mediaOrigins, parseYoutubeId, publicView, readDoc,
  validateDoc, voteKey, writeDoc, type NovinkyDoc,
} from '../policy'

const MEDIA = 'https://media.example.test'
const origins = mediaOrigins({ S3_FILE_URL: `${MEDIA}/files`, NODE_ENV: 'production' } as NodeJS.ProcessEnv, [])
const now = new Date('2026-10-28T10:00:00.000Z')

const post = (extra: Record<string, unknown> = {}) => ({
  category: 'novinka', kind: 'image', title: 'Nový produkt', excerpt: 'Text', image_url: `${MEDIA}/a.jpg`, ...extra,
})
const validate = (input: Record<string, unknown>, previous: NovinkyDoc = emptyDoc()) =>
  validateDoc({ posts: [], ...input }, { origins, previous, now })
const rejects = (input: Record<string, unknown>, pattern: RegExp) => {
  expect(() => validate(input)).toThrow(NovinkyValidationError)
  expect(() => validate(input)).toThrow(pattern)
}

describe('novinky policy – texts and URLs', () => {
  it('rejects HTML and strips control and bidi characters', () => {
    expect(() => cleanText('<script>alert(1)</script>', 100, 'X')).toThrow(/HTML/)
    expect(() => cleanText('ahoj <b>svet</b>', 100, 'X')).toThrow(/HTML/)
    expect(cleanText('a‮b\u0000c', 100, 'X')).toBe('abc')
    expect(cleanText('1 < 2 a 3 > 2', 100, 'X')).toBe('1 < 2 a 3 > 2')
    expect(cleanText('a\n\n\n\nb', 100, 'X', { multiline: true })).toBe('a\n\nb')
    expect(cleanText('a\nb', 100, 'X')).toBe('a b')
    expect(() => cleanText('x'.repeat(11), 10, 'X')).toThrow(/10 znakov/)
  })

  it('accepts only https or relative links without credentials', () => {
    expect(cleanLinkUrl('https://anastasiaoz.eu/obchod', 'L')).toBe('https://anastasiaoz.eu/obchod')
    expect(cleanLinkUrl('/obchod', 'L')).toBe('/obchod')
    for (const bad of ['javascript:alert(1)', 'http://x.test', '//evil.test', 'https://u:p@x.test', 'data:text/html,x']) {
      expect(() => cleanLinkUrl(bad, 'L')).toThrow(NovinkyValidationError)
    }
  })

  it('parses YouTube ids from common URL shapes only', () => {
    expect(parseYoutubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1')).toBe('dQw4w9WgXcQ')
    expect(parseYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYoutubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYoutubeId('https://evil.test/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseYoutubeId('http://youtu.be/dQw4w9WgXcQ')).toBeNull()
    expect(parseYoutubeId('"><img>')).toBeNull()
  })
})

describe('novinky policy – document validation', () => {
  it('rejects media outside our storage and wrong file types (fail closed)', () => {
    rejects({ posts: [post({ image_url: 'https://evil.test/a.jpg' })] }, /nahrajte/)
    rejects({ posts: [post({ image_url: `${MEDIA}/a.svg` })] }, /JPG/)
    rejects({ posts: [post({ kind: 'video', video_url: `${MEDIA}/v.mov` })] }, /MP4/)
    const library = mediaOrigins({ NODE_ENV: 'production' } as NodeJS.ProcessEnv, ['https://lib.example.test/x.png'])
    expect(validateDoc({ posts: [post({ image_url: 'https://lib.example.test/b.png' })] }, { origins: library, previous: emptyDoc(), now }).posts).toHaveLength(1)
    expect(mediaOrigins({ S3_FILE_URL: 'http://localhost:9000', NODE_ENV: 'production' } as NodeJS.ProcessEnv, []).size).toBe(0)
  })

  it('requires content matching the post kind', () => {
    rejects({ posts: [post({ image_url: null })] }, /fotografiu/)
    rejects({ posts: [post({ kind: 'youtube', youtube_id: 'nope' })] }, /YouTube/)
    rejects({ posts: [post({ kind: 'text', excerpt: '' })] }, /text/)
    rejects({ posts: [post({ category: 'spam' })] }, /rubriku/)
    rejects({ posts: [post({ link_label: 'Viac' })] }, /odkaz/)
    const yt = validate({ posts: [post({ kind: 'youtube', youtube_id: 'https://youtu.be/dQw4w9WgXcQ', video_url: `${MEDIA}/v.mp4` })] })
    expect(yt.posts[0]).toMatchObject({ youtube_id: 'dQw4w9WgXcQ', video_url: null })
  })

  it('allows a single featured post and caps the number of posts', () => {
    rejects({ posts: [post({ featured: true }), post({ featured: true })] }, /len jeden/)
    rejects({ posts: Array.from({ length: 61 }, () => post()) }, /60/)
  })

  it('assigns stable unique ids and keeps poll option ids so votes are never reassigned', () => {
    const first = validate({ posts: [post({ kind: 'poll', image_url: null, poll: { question: 'Ktorá vôňa?', options: [{ label: 'Levanduľa' }, { label: 'Ruža' }] } }), post()] })
    const [poll, image] = first.posts
    expect(poll.id).not.toBe(image.id)
    expect(poll.poll!.options.map((o) => o.id)).toEqual(['o1', 'o2'])
    const previous: NovinkyDoc = { ...first, updated_at: '2026-10-28T09:00:00.000Z', updated_by: 'u' }
    // Lucia zmaže „Levanduľu“ a pridá novú možnosť: nová nesmie zdediť id (a hlasy) zmazanej.
    const second = validate({ posts: [{ ...poll, poll: { question: 'Ktorá vôňa?', options: [{ id: 'o2', label: 'Ruža' }, { label: 'Mäta' }] } }] }, previous)
    expect(second.posts[0].id).toBe(poll.id)
    expect(second.posts[0].poll!.options).toEqual([{ id: 'o2', label: 'Ruža' }, { id: 'o3', label: 'Mäta' }])
    rejects({ posts: [post({ kind: 'poll', poll: { question: 'Q', options: [{ label: 'jediná' }] } })] }, /2 až 6/)
  })

  it('validates ad slots and requires complete enabled ads', () => {
    rejects({ ads: [{ slot: 4 }] }, /plochy/)
    rejects({ ads: [{ slot: 1 }, { slot: 1 }] }, /plochy/)
    rejects({ ads: [{ slot: 1, enabled: true, title: 'Salón' }] }, /nadpis, obrázok a odkaz/)
    rejects({ ads: [{ slot: 2, active_from: '2026-11-02', active_to: '2026-11-01' }] }, /skôr/)
    rejects({ panel: { ad_slot: 7 } }, /plocha/)
    const doc = validate({ ads: [{ slot: 2, enabled: true, title: 'Salón', url: 'https://salon.test', image_url: `${MEDIA}/s.webp` }] })
    expect(doc.ads.map((a) => a.slot)).toEqual([1, 2, 3])
    expect(doc.ads[1]).toMatchObject({ enabled: true, label: 'Reklama' })
  })
})

describe('novinky policy – public view', () => {
  const stored = (): NovinkyDoc => {
    const v = validate({
      panel: { enabled: true, title: 'Naše', title_script: 'novinky', ad_slot: 1 },
      posts: [
        post({ id: 'later', title: 'Naplánovaný', published_at: '2026-11-01T00:00:00Z' }),
        post({ id: 'hidden', title: 'Skrytý', hidden: true }),
        post({ id: 'feat', title: 'Kráľovna', featured: true, published_at: '2026-10-01T00:00:00Z' }),
        post({ id: 'old', title: 'Starší', published_at: '2026-09-01T00:00:00Z', sort: 0 }),
        post({ id: 'new', title: 'Novší', published_at: '2026-10-20T00:00:00Z', sort: 0 }),
        { id: 'poll', category: 'anketa', kind: 'poll', title: 'Anketa', published_at: '2026-10-02T00:00:00Z', sort: 5, poll: { question: 'Q?', options: [{ label: 'A' }, { label: 'B' }] } },
      ],
      ads: [
        { slot: 1, enabled: true, title: 'Aktívna', url: 'https://a.test', image_url: `${MEDIA}/1.jpg` },
        { slot: 2, enabled: true, title: 'Budúca', url: 'https://b.test', image_url: `${MEDIA}/2.jpg`, active_from: '2026-12-01' },
        { slot: 3, enabled: false, title: 'Vypnutá', url: 'https://c.test', image_url: `${MEDIA}/3.jpg` },
      ],
    })
    return { ...v, updated_at: '2026-10-28T09:00:00.000Z', updated_by: 'user_secret' }
  }

  it('hides scheduled and hidden posts, sorts, separates featured and exposes only active ads', () => {
    const view = publicView(stored(), new Map([[voteKey('poll', 'o1'), 3], [voteKey('poll', 'o2'), 1]]), now)
    expect(view.featured?.id).toBe('feat')
    expect(view.posts.map((p) => p.id)).toEqual(['new', 'old', 'poll'])
    expect(view.posts[2].poll).toEqual({ question: 'Q?', options: [{ id: 'o1', label: 'A', votes: 3 }, { id: 'o2', label: 'B', votes: 1 }], total: 4 })
    expect(view.ads.map((a) => a.slot)).toEqual([1])
    expect(view.panel.ad?.slot).toBe(1)
    expect(JSON.stringify(view)).not.toMatch(/user_secret|hidden|Naplánovaný|Budúca|Vypnutá|active_from|updated_by/)
  })

  it('round-trips through store metadata and ignores corrupted entries', () => {
    const meta = writeDoc({ other: 1 }, stored())
    expect(meta.other).toBe(1)
    expect(readDoc(meta).posts).toHaveLength(6)
    const broken = readDoc({ anastasia_novinky: { posts: [{ id: 'x' }, null, 'x'], ads: [{ slot: 9 }], panel: { ad_slot: 'z' } } })
    expect(broken.posts).toEqual([])
    expect(broken.ads.map((a) => a.slot)).toEqual([1, 2, 3])
    expect(broken.panel.ad_slot).toBe(1)
    expect(readDoc(undefined)).toEqual(emptyDoc())
  })
})
