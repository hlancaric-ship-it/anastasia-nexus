// Seskupení zakoupených materiálů podle týdnů pro RESET 40+ knihovnu.
export function groupLibraryItems(entitlements = []) {
  const products = new Map()
  for (const entry of entitlements) {
    const product = entry.product
    if (!product?.id || !product.media?.length) continue
    products.set(product.id, product)
  }

  const weeks = new Map()
  const getWeek = weekNum => {
    let week = weeks.get(weekNum)
    if (!week) {
      week = { week: weekNum, title: `Týždeň ${weekNum}`, videos: [], pdfs: [], audios: [] }
      weeks.set(weekNum, week)
    }
    return week
  }

  for (const product of products.values()) {
    if (product.handle === 'reset-40-plus') {
      for (const media of product.media) {
        const key = media.key || ''
        const lesson = /lekcia-(\d{2})\.mp4$/.exec(key)
        const pdf = /tyzden-(\d{2})\/(samostudium|den-\d+)\.pdf$/.exec(key)
        const weekNum = lesson ? Math.max(1, Number(lesson[1])) : pdf ? Number(pdf[1]) : null
        if (!weekNum) continue
        const kind = media.kind === 'document' && key.endsWith('.pdf') ? 'pdf' : media.kind
        const item = { key, title: media.title || key.split('/').pop() || key, kind, productId: product.id }
        if (item.kind === 'video') getWeek(weekNum).videos.push(item)
        else if (item.kind === 'pdf') getWeek(weekNum).pdfs.push(item)
        else if (item.kind === 'audio') getWeek(weekNum).audios.push(item)
      }
    } else if (product.handle === 'nic-nemusis') {
      const week = getWeek(1)
      week.audios.push({
        key: 'nic-nemusis/A0_nic-nemusis.mp3', title: 'Audio 0 · Ukážka', kind: 'audio',
        productId: product.id, previewUrl: '/media/a0_nic-nemusis.mp3',
      })
      for (const media of product.media) {
        const key = media.key || ''
        if (!/\bA[1-6][_-].*\.mp3$/i.test(key.split('/').pop() || '')) continue
        week.audios.push({ key, title: media.title || key.split('/').pop(), kind: 'audio', productId: product.id })
      }
    }
  }

  for (const week of weeks.values()) {
    week.videos.sort((a, b) => a.key.localeCompare(b.key))
    week.pdfs.sort((a, b) => a.key.localeCompare(b.key))
    week.audios.sort((a, b) => a.key.localeCompare(b.key))
  }
  return [...weeks.values()].sort((a, b) => a.week - b.week)
}
