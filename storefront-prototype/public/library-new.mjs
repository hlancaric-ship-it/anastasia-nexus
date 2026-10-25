// Knihovna zakoupených programů (Moja knižnica) – nový design
// Přehrávač + navigace podle týdnů pro RESET 40+

import { groupLibraryItems } from './library-groups.mjs'

const node = (tag, text, cls) => {
  const el = document.createElement(tag)
  if (text != null) el.textContent = text
  if (cls) el.className = cls
  return el
}

export async function mountLibrary(target, api) {
  let activePlayer = null
  let hls = null
  let requestVersion = 0
  let currentWeek = 1
  let currentVideoIndex = 0

  const stopPlayer = () => {
    if (hls) { hls.destroy(); hls = null }
    if (activePlayer) {
      activePlayer.pause()
      activePlayer.removeAttribute('src')
      activePlayer.load()
      activePlayer = null
    }
  }

  const failMessage = 'Obsah sa teraz nepodarilo otvoriť. Skúste to znova o chvíľu.'

  let data
  try { data = await api.getEntitlements() } catch { showError(target, failMessage); return stopPlayer }
  if (data.ok === false) {
    showError(target, 'Prístupy sa teraz nepodarilo načítať. Obnovte stránku.')
    return stopPlayer
  }

  if (!data.active && !data.authenticated) {
    showLockedState(target)
    return stopPlayer
  }

  const products = new Map()
  for (const access of data.entitlements || [])
    if (access.product?.id && !products.has(access.product.id))
      products.set(access.product.id, access.product)

  const grouped = groupLibraryItems(data.entitlements || [])

  // Desktop: dvousloupcový layout
  // Mobil: přehrávač nahoře (max 40 %), pod ním akordeon

  const isDesktop = matchMedia('(min-width: 768px)').matches

  const container = node('div', null, 'library-container')
  const playerSection = node('div', null, isDesktop ? 'library-player-section desktop' : 'library-player-section mobile')
  const navSection = node('div', null, 'library-nav-section')

  // Přehrávač
  const playerBox = node('div', null, 'library-player-box')
  const playerTitle = node('h2', '', 'library-player-title')
  const playerControls = node('div', null, 'library-player-controls')
  const prevBtn = node('button', 'Predchádzajúca', 'button outline library-prev-btn')
  const nextBtn = node('button', 'Ďalšia', 'button outline library-next-btn')
  prevBtn.type = 'button'
  nextBtn.type = 'button'
  playerControls.append(prevBtn, nextBtn)

  // Filtr
  const filterBox = node('div', null, 'library-filter-box')
  const searchInput = node('input', null, 'library-search-input')
  searchInput.type = 'search'
  searchInput.placeholder = 'Hľadať v knižnici...'
  const filterTabs = node('div', null, 'library-filter-tabs')
  const filterAll = node('button', 'Všetko', 'library-filter-btn active')
  const filterVideo = node('button', 'Videá', 'library-filter-btn')
  const filterAudio = node('button', 'Audio', 'library-filter-btn')
  const filterPdf = node('button', 'PDF', 'library-filter-btn')
  filterAll.dataset.filter = 'all'
  filterVideo.dataset.filter = 'video'
  filterAudio.dataset.filter = 'audio'
  filterPdf.dataset.filter = 'pdf'
  filterTabs.append(filterAll, filterVideo, filterAudio, filterPdf)
  filterBox.append(searchInput, filterTabs)

  // Akordeon
  const accordion = node('div', null, 'library-accordion')

  if (!grouped.length) {
    const empty = node('div', null, 'library-empty')
    empty.append(node('p', 'Zatiaľ nemáte zakúpený žiadny program ani nahrávku.', 'form-status'))
    target.replaceChildren(empty)
    return stopPlayer
  }

  navSection.append(filterBox, accordion)
  playerSection.append(playerBox, playerTitle, playerControls)
  container.append(playerSection, navSection)
  target.replaceChildren(container)

  // Vytvoření akordeonu
  let activeWeekPanel = null

  for (const week of grouped) {
    const panel = node('details', null, 'library-week-panel')
    const summary = node('summary', null, 'library-week-summary')
    const weekHeader = node('div', null, 'library-week-header')
    const weekTitle = node('h3', week.title, 'library-week-title')
    const weekCount = node('span', `${week.videos.length} videí · ${week.audios.length} audio · ${week.pdfs.length} PDF`, 'library-week-count')
    weekHeader.append(weekTitle, weekCount)
    summary.append(weekHeader)

    const content = node('div', null, 'library-week-content')

    // Video lekcie
    if (week.videos.length) {
      const videoList = node('div', null, 'library-video-list')
      for (const item of week.videos) {
        const row = createLibraryRow(item, 'video', api, products)
        videoList.append(row)
      }
      content.append(node('h4', 'Videá', 'library-section-title'), videoList)
    }

    // PDF materiály
    if (week.pdfs.length) {
      const pdfList = node('div', null, 'library-pdf-list')
      for (const item of week.pdfs) {
        const row = createLibraryRow(item, 'pdf')
        pdfList.append(row)
      }
      content.append(node('h4', 'PDF materiály', 'library-section-title'), pdfList)
    }

    if (week.audios.length) {
      const audioList = node('div', null, 'library-audio-list')
      for (const item of week.audios) audioList.append(createLibraryRow(item, 'audio'))
      content.append(node('h4', 'Nahrávky', 'library-section-title'), audioList)
    }

    panel.append(summary, content)
    accordion.append(panel)

    // Otevřít první týden
    if (week.week === 1) {
      panel.open = true
      activeWeekPanel = panel
    }
  }

  // Uložení pozice do localStorage
  const savePosition = () => {
    try {
      if (activePlayer && activePlayer.currentTime > 0) {
        localStorage.setItem('library-last-week', String(currentWeek))
        localStorage.setItem('library-last-video', String(currentVideoIndex))
        localStorage.setItem('library-last-time', String(Math.floor(activePlayer.currentTime)))
      }
    } catch {}
  }

  // Načtení pozice
  const loadPosition = () => {
    try {
      const lastWeek = parseInt(localStorage.getItem('library-last-week') || '1', 10)
      const lastVideo = parseInt(localStorage.getItem('library-last-video') || '0', 10)
      const lastTime = parseInt(localStorage.getItem('library-last-time') || '0', 10)

      if (lastWeek >= 1 && lastWeek <= grouped.length) {
        currentWeek = lastWeek
        currentVideoIndex = lastVideo

        // Otevřít odpovídající týden v akordeonu
        const panels = accordion.querySelectorAll('details')
        let targetPanel = null
        for (const panel of panels) {
          const weekNum = parseInt(panel.querySelector('.library-week-title')?.textContent?.replace(/\D/g, '') || '1', 10)
          if (weekNum === lastWeek) { targetPanel = panel; break }
        }
        if (targetPanel) { targetPanel.open = true; activeWeekPanel = targetPanel }

        // Přehrát video
        const week = grouped[lastWeek - 1]
        if (week && week.videos[lastVideo]) {
          // Bez autoplay: len plagát s tlačidlom, prístup k médiu a zvuk až po kliknutí.
          showPoster(week.videos[lastVideo], lastTime)
        }
      }
    } catch {}
  }

  const showPoster = (item, resumeAt = 0) => {
    if (item.kind !== 'video' && item.kind !== 'audio') return
    playerTitle.textContent = item.title
    const poster = node('button', null, 'library-poster')
    poster.type = 'button'
    poster.setAttribute('aria-label', `Prehrať: ${item.title}`)
    const icon = node('span', null, 'library-poster__play')
    icon.setAttribute('aria-hidden', 'true')
    poster.append(icon, node('span', resumeAt > 0 ? 'Pokračovať v prehrávaní' : 'Prehrať lekciu', 'library-poster__label'), node('strong', item.title, 'library-poster__title'))
    poster.addEventListener('click', async () => {
      await playItem(item, api, products)
      const player = activePlayer
      if (player && resumeAt > 0) player.addEventListener('loadedmetadata', () => { if (resumeAt < player.duration) player.currentTime = resumeAt }, { once: true })
    }, { once: true })
    playerBox.replaceChildren(poster)
  }

  // Ovládání přehrávače
  const playItem = async (item, api, products) => {
    stopPlayer()

    // Dispatch event pro ztlumení ambientu
    document.dispatchEvent(new CustomEvent('ana:media-play'))

    activePlayer = null

    // Zvýraznit aktivní položku
    document.querySelectorAll('.library-item-row.active').forEach(el => el.classList.remove('active'))
    const rows = accordion.querySelectorAll('.library-item-row')
    for (const row of rows) {
      if (row.dataset.key === item.key) { row.classList.add('active'); break }
    }

    // Zaškrtnutí (uložit do localStorage)
    try {
      const completed = JSON.parse(localStorage.getItem('library-completed') || '{}')
      completed[item.key] = true
      localStorage.setItem('library-completed', JSON.stringify(completed))
    } catch {}

    // Otevřít týden v akordeonu
    const weekNum = item.key.includes('tyzden-') ? parseInt(item.key.match(/tyzden-(\d{2})/)?.[1] || '1', 10) :
                     item.key.includes('lekcia-') ? (item.key.match(/lekcia-(\d{2})/)?.[1] === '00' ? 1 : parseInt(item.key.match(/lekcia-(\d{2})/)?.[1] || '1', 10)) : 1
    const panels = accordion.querySelectorAll('details')
    for (const panel of panels) {
      const wNum = parseInt(panel.querySelector('.library-week-title')?.textContent?.replace(/\D/g, '') || '1', 10)
      if (wNum === weekNum) { panel.open = true; activeWeekPanel = panel; break }
    }

    currentWeek = weekNum
    if (item.kind === 'video' || item.kind === 'audio') {
      const product = products.get(item.productId)
      if (!product) return

      playerTitle.textContent = item.title

      try {
        const access = item.previewUrl ? null : await api.getMediaAccess({ product_id: product.id, media_key: item.key })
        if (access && !access.ok) throw Error(access.message || failMessage)

        const url = new URL(item.previewUrl || access.url, location.origin)
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname))) throw Error(failMessage)

        const player = document.createElement(item.kind === 'audio' ? 'audio' : 'video')
        player.controls = true
        player.preload = 'metadata'
        player.crossOrigin = 'anonymous'
        player.setAttribute('controlsList', 'nodownload')
        player.dataset.libraryPlayer = ''
        playerBox.replaceChildren(player)
        activePlayer = player

        if (access?.watermark) playerBox.append(node('p', access.watermark, 'library-watermark'))

        if (item.key.toLowerCase().endsWith('.m3u8')) {
          const { default: Hls } = await import('/vendor/hls.min.mjs')
          if (!Hls.isSupported()) throw Error('Tento prehliadač nepodporuje prehrávanie videa. Skúste aktuálny Chrome, Firefox alebo Safari.')
          hls = new Hls({ enableWorker: false })
          hls.loadSource(url.href)
          hls.attachMedia(player)
          hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) { stopPlayer(); showError(playerBox, failMessage) } })
        } else {
          player.src = url.href
        }

        player.addEventListener('error', () => { showError(playerBox, failMessage) })
        player.addEventListener('timeupdate', savePosition)
        player.addEventListener('ended', savePosition)

        await player.play().catch(() => {})

        // Obnova odkazu před expirací
        const scheduleRenewal = expiresAt => {
          const at = Date.parse(expiresAt)
          if (Number.isFinite(at)) {
            const delay = Math.max(1000, at - Date.now() - 30000)
            setTimeout(async () => {
              if (activePlayer !== player) return
              try {
                const nextAccess = await api.getMediaAccess({ product_id: product.id, media_key: item.key })
                if (!nextAccess.ok) throw Error()
                const nextUrl = new URL(nextAccess.url, location.origin)
                if (nextUrl.origin !== url.origin) throw Error()
                const time = player.currentTime
                const paused = player.paused
                if (hls) hls.loadSource(nextUrl.href)
                else player.src = nextUrl.href
                await new Promise((ok, fail) => {
                  player.addEventListener('loadedmetadata', () => { player.currentTime = time; if (!paused) player.play().catch(() => {}); ok() }, { once: true })
                  setTimeout(fail, 5000)
                })
                scheduleRenewal(nextAccess.expires_at)
              } catch {
                stopPlayer()
                showError(playerBox, 'Prístup sa nepodarilo obnoviť. Otvorte obsah znova.')
              }
            }, delay)
          }
        }
        if (access?.expires_at) scheduleRenewal(access.expires_at)

      } catch (error) {
        showError(playerBox, error.message || failMessage)
      }
    } else if (item.kind === 'pdf') {
      const popup = window.open('about:blank', '_blank')
      if (popup) popup.opener = null
      try {
        const product = products.get(item.productId)
        if (!product) return

        const access = await api.getMediaAccess({ product_id: product.id, media_key: item.key })
        if (!access.ok) throw Error(access.message || failMessage)

        const url = new URL(access.url, location.origin)
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname))) throw Error(failMessage)

        if (popup) popup.location.replace(url.href)
        else {
          const link = node('a', 'Otvoriť PDF', 'text-link')
          link.href = url.href
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          playerBox.replaceChildren(link)
        }
      } catch (error) {
        popup?.close()
        showError(playerBox, error.message || failMessage)
      }
    }
  }

  // Tlačítka přehrávače
  prevBtn.addEventListener('click', () => {
    const week = grouped[currentWeek - 1]
    if (!week || !week.videos.length) return

    currentVideoIndex--
    if (currentVideoIndex < 0) {
      if (currentWeek > 1) {
        currentWeek--
        const prevWeek = grouped[currentWeek - 1]
        currentVideoIndex = prevWeek.videos.length - 1
      } else {
        currentVideoIndex = 0
      }
    }

    const item = week.videos[currentVideoIndex]
    if (item) playItem(item, api, products)
  })

  nextBtn.addEventListener('click', () => {
    const week = grouped[currentWeek - 1]
    if (!week || !week.videos.length) return

    currentVideoIndex++
    if (currentVideoIndex >= week.videos.length) {
      if (currentWeek < grouped.length) {
        currentWeek++
        currentVideoIndex = 0
      } else {
        currentVideoIndex = week.videos.length - 1
      }
    }

    const item = week.videos[currentVideoIndex]
    if (item) playItem(item, api, products)
  })

  // Filtrování a vyhledávání
  let currentFilter = 'all'
  let searchQuery = ''

  const filterItems = () => {
    const rows = accordion.querySelectorAll('.library-item-row')
    for (const row of rows) {
      const kind = row.dataset.kind
      const title = row.querySelector('.library-item-title')?.textContent?.toLowerCase() || ''
      const matchesFilter = currentFilter === 'all' || kind === currentFilter
      const matchesSearch = !searchQuery || title.includes(searchQuery)
      row.hidden = !matchesFilter || !matchesSearch
    }
  }

  filterAll.addEventListener('click', () => {
    currentFilter = 'all'
    document.querySelectorAll('.library-filter-btn').forEach(b => b.classList.toggle('active', b === filterAll))
    filterItems()
  })
  filterVideo.addEventListener('click', () => {
    currentFilter = 'video'
    document.querySelectorAll('.library-filter-btn').forEach(b => b.classList.toggle('active', b === filterVideo))
    filterItems()
  })
  filterAudio.addEventListener('click', () => {
    currentFilter = 'audio'
    document.querySelectorAll('.library-filter-btn').forEach(b => b.classList.toggle('active', b === filterAudio))
    filterItems()
  })
  filterPdf.addEventListener('click', () => {
    currentFilter = 'pdf'
    document.querySelectorAll('.library-filter-btn').forEach(b => b.classList.toggle('active', b === filterPdf))
    filterItems()
  })

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.toLowerCase()
    filterItems()
  })

  // Klik na položku v akordeonu
  accordion.addEventListener('click', async (event) => {
    const row = event.target.closest('.library-item-row')
    if (!row || row.hidden) return

    const itemKey = row.dataset.key
    const kind = row.dataset.kind

    // Najít odpovídající položku v grouped
    for (const week of grouped) {
      for (const item of [...week.videos, ...week.pdfs, ...week.audios]) {
        if (item.key === itemKey) {
          if (kind === 'video') {
            currentVideoIndex = week.videos.indexOf(item)
            playItem(item, api, products)
          } else if (kind === 'audio' || kind === 'pdf') {
            playItem(item, api, products)
          }
          return
        }
      }
    }
  })

  // Klik na summary (expand/collapse)
  accordion.addEventListener('toggle', () => {
    const openPanels = accordion.querySelectorAll('details[open]')
    if (openPanels.length > 1) {
      for (const panel of openPanels) {
        if (panel !== activeWeekPanel) panel.open = false
      }
    }
    if (activeWeekPanel) activeWeekPanel.open = true
  })

  // Načíst pozici při startu
  loadPosition()

  return stopPlayer
}

function showError(container, message) {
  const existing = container.querySelector('.library-error')
  if (existing) { existing.textContent = message; return }
  const error = node('p', message, 'library-error form-status')
  error.setAttribute('role', 'status')
  container.append(error)
}

function showLockedState(target) {
  const box = node('div', null, 'empty-state locked-library')
  box.append(
    node('p', 'ZAMKNUTÁ KNIŽNICA', 'eyebrow'),
    node('h2', 'Tento priestor čaká na vás.'),
    node('p', 'Zakúpené programy a súbory sa zobrazia po prihlásení.'),
    Object.assign(node('a', 'Prihlásiť sa', 'button'), { href: '/prihlasenie' })
  )
  target.replaceChildren(box)
}

function createLibraryRow(item, kind) {
  const row = node('div', null, 'library-item-row')
  row.dataset.key = item.key
  row.dataset.kind = kind

  const title = node('span', item.title, 'library-item-title')

  let label
  if (kind === 'video') label = 'Prehrať video'
  else if (kind === 'audio') label = 'Prehrať zvuk'
  else if (kind === 'pdf') label = 'Otvoriť PDF'

  const btn = node('button', label, 'button outline library-item-btn')
  btn.type = 'button'

  // Zaškrtnutí pro dokončené položky
  try {
    const completed = JSON.parse(localStorage.getItem('library-completed') || '{}')
    if (completed[item.key]) {
      const check = node('span', '', 'library-item-check')
      check.textContent = '✓'
      row.classList.add('completed')
      row.append(title, check, btn)
      return row
    }
  } catch {}

  row.append(title, btn)

  return row
}
