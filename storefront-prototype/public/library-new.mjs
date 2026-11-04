// Knihovna zakoupených programů (Moja knižnica) – dominantní přehrávač & 12-sloupcový grid
import { groupLibraryItems } from './library-groups.mjs';

const node = (tag, text, cls) => {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (cls) el.className = cls;
  return el;
};

export async function mountLibrary(target, api) {
  const report = detail => target.dispatchEvent(new CustomEvent('library:ready', { bubbles: true, detail }));
  let activePlayer = null;
  let hls = null;
  let requestVersion = 0;
  let currentTrackIndex = 0;
  const standaloneLibrary = Boolean(target.closest('.library-page'));

  const stopPlayer = () => {
    if (hls) { hls.destroy(); hls = null; }
    if (activePlayer) {
      activePlayer.pause();
      activePlayer.removeAttribute('src');
      activePlayer.load();
      activePlayer = null;
    }
  };

  const failMessage = 'Obsah sa teraz nepodarilo otvoriť. Skúste to znova o chvíľu.';

  let data;
  try {
    data = await api.getEntitlements();
  } catch {
    showError(target, failMessage);
    report({ unavailable: true, authenticated: false, products: 0 });
    return stopPlayer;
  }

  if (data.ok === false) {
    showError(target, 'Prístupy sa teraz nepodarilo načítať. Obnovte stránku.');
    report({ unavailable: true, authenticated: false, products: 0 });
    return stopPlayer;
  }

  if (!data.active && !data.authenticated) {
    showLockedState(target);
    report({ authenticated: false, products: 0 });
    return stopPlayer;
  }

  const products = new Map();
  for (const access of data.entitlements || []) {
    if (access.product?.id && !products.has(access.product.id)) {
      products.set(access.product.id, access.product);
    }
  }
  report({ authenticated: Boolean(data.authenticated), products: products.size });

  const grouped = groupLibraryItems(data.entitlements || []);

  // Sesbíráme všechny položky do lineárního playlistu pro navigaci
  const allTracks = [];
  for (const week of grouped) {
    // Každá položka nese odkaz na příslušný týden a související PDF
    const weekPdf = week.pdfs[0] || null;
    for (const item of [...week.videos, ...week.audios, ...week.pdfs]) {
      item.weekTitle = week.title;
      item.weekNum = week.week;
      item.pdfAttachment = weekPdf;
      allTracks.push(item);
    }
  }

  if (!allTracks.length) {
    const empty = node('div', null, 'library-empty empty-state');
    empty.append(node('p', 'Zatiaľ nemáte zakúpený žiadny program ani nahrávku.', 'form-status'));
    target.replaceChildren(empty);
    return stopPlayer;
  }

  // Zjistíme název hlavního programu
  const primaryProduct = products.values().next().value;
  const programTitle = primaryProduct?.title || grouped[0]?.title || 'Moja knižnica';

  // --- STAV DOKONČENÍ (localStorage) ---
  const getCompleted = () => {
    try {
      return JSON.parse(localStorage.getItem('library-completed') || '{}');
    } catch {
      return {};
    }
  };
  const setCompleted = key => {
    try {
      const c = getCompleted();
      c[key] = true;
      localStorage.setItem('library-completed', JSON.stringify(c));
    } catch {}
  };

  // --- HLAVNÍ STRUKTURA (12-sloupcový grid na desktopu) ---
  const container = node('div', null, 'library-grid-12');

  // === LEVÝ SLOUPEC (7 z 12): Multimediální video/audio přehrávač + detail ===
  const leftCol = node('div', null, 'library-left-col');

  // 1. Karta přehrávače
  const playerCard = node('div', null, 'library-player-card');

  // Container videa (fixní poměr 16:9, rounded-2xl/3xl, tmavé pozadí)
  const playerBox = node('div', null, 'library-player-box');
  const playerEmpty = node('div', null, 'library-player-empty');
  playerEmpty.append(
    node('span', '▶', 'library-player-empty__icon'),
    node('p', 'Vyberte lekciu zo zoznamu pre spustenie', 'library-player-empty__text')
  );
  playerBox.append(playerEmpty);

  // 2. Navigační lišta přímo pod videem
  const playerNav = node('div', null, 'library-player-nav');
  const prevBtn = node('button', '← Predchádzajúca', 'button outline library-nav-btn library-prev-btn');
  prevBtn.type = 'button';
  const trackIndicator = node('span', 'Stopa 1 z ' + allTracks.length, 'library-track-indicator');
  const nextBtn = node('button', 'Ďalšia →', 'button outline library-nav-btn library-next-btn');
  nextBtn.type = 'button';
  playerNav.append(prevBtn, trackIndicator, nextBtn);

  playerCard.append(playerBox, playerNav);

  // 3. Karta detailu stopy (světlá karta pod přehrávačem)
  const detailCard = node('article', null, 'library-track-detail');
  const detailMeta = node('div', null, 'library-detail-meta');
  const detailBadge = node('span', 'Lekcia', 'library-detail-badge');
  const detailProgram = node('span', programTitle, 'library-detail-program');
  detailMeta.append(detailBadge, detailProgram);

  const detailTitle = node('h2', allTracks[0]?.title || '', 'library-detail-title');
  const detailDesc = node('p', 'Lekcia z programu ' + programTitle + '. Prehrávanie spustíte v prehrávači.', 'library-detail-desc');
  const detailActions = node('div', null, 'library-detail-actions');
  const pdfDownloadBtn = node('a', '📄 Stiahnuť PDF k lekcii', 'button outline library-pdf-btn');
  pdfDownloadBtn.target = '_blank';
  pdfDownloadBtn.rel = 'noopener noreferrer';
  pdfDownloadBtn.hidden = true;
  detailActions.append(pdfDownloadBtn);

  detailCard.append(detailMeta, detailTitle, detailDesc, detailActions);

  leftCol.append(playerCard, detailCard);

  // === PRAVÝ SLOUPEC (5 z 12): Filtry a Playlist ===
  const rightCol = node('div', null, 'library-right-col');

  // 1. Hlavička: Search input a filtrační tlačítka v jednom horním bloku
  const filterBlock = node('div', null, 'library-filter-block');
  const searchWrap = node('div', null, 'library-search-wrap');
  const searchInput = node('input', null, 'library-search-input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Hľadať v knižnici...';
  searchInput.setAttribute('aria-label', 'Hľadať v knižnici');
  searchWrap.append(searchInput);

  const filterTabs = node('div', null, 'library-filter-tabs');
  const filterAll = node('button', 'Všetko', 'library-filter-btn active');
  const filterVideo = node('button', 'Videá', 'library-filter-btn');
  const filterAudio = node('button', 'Audio', 'library-filter-btn');
  const filterPdf = node('button', 'PDF', 'library-filter-btn');
  filterAll.type = 'button'; filterAll.dataset.filter = 'all';
  filterVideo.type = 'button'; filterVideo.dataset.filter = 'video';
  filterAudio.type = 'button'; filterAudio.dataset.filter = 'audio';
  filterPdf.type = 'button'; filterPdf.dataset.filter = 'pdf';
  filterTabs.append(filterAll, filterVideo, filterAudio, filterPdf);

  filterBlock.append(searchWrap, filterTabs);

  // 2. Karta kurzu & Playlist
  const playlistCard = node('section', null, 'library-playlist-card');
  playlistCard.setAttribute('aria-label', 'Zoznam lekcií a materiálov');

  const playlistHead = node('div', null, 'library-playlist-head');
  const courseTitle = node('h3', programTitle, 'library-course-title');
  const progressPill = node('span', '', 'library-progress-pill');
  playlistHead.append(courseTitle, progressPill);

  const playlistList = node('div', null, 'library-playlist-list');
  playlistList.setAttribute('role', 'list');

  playlistCard.append(playlistHead, playlistList);
  rightCol.append(filterBlock, playlistCard);

  container.append(leftCol, rightCol);
  target.replaceChildren(container);

  // --- AKTUALIZACE UKAZATELE DOKONČENÍ ---
  const updateProgressPill = () => {
    const completed = getCompleted();
    const count = allTracks.filter(t => completed[t.key]).length;
    progressPill.textContent = `${count} / ${allTracks.length} hotovo`;
  };
  updateProgressPill();

  // --- ZOBRAZENÍ / AKTUALIZACE DETAILU STOPY ---
  const updateDetailCard = item => {
    if (!item) return;
    detailTitle.textContent = item.title;
    detailBadge.textContent = item.kind === 'video' ? 'Video lekcia' : item.kind === 'audio' ? 'Audio nahrávka' : 'PDF materiál';
    detailProgram.textContent = item.weekTitle || programTitle;
    detailDesc.textContent = item.description || `Materiál ${item.title} z programu ${programTitle}.`;

    // PDF tlačítko: pokud má lekce přiřazené PDF nebo je sama PDF
    const targetPdf = item.kind === 'pdf' ? item : item.pdfAttachment;
    if (targetPdf) {
      pdfDownloadBtn.hidden = false;
      pdfDownloadBtn.textContent = '📄 Stiahnuť PDF k lekcii';
      pdfDownloadBtn.onclick = async e => {
        e.preventDefault();
        await playItem(targetPdf);
      };
    } else {
      pdfDownloadBtn.hidden = true;
    }
  };

  let isPlaying = false;

  // --- GENEROVÁNÍ POLOŽEK PLAYLISTU ---
  const renderPlaylist = () => {
    playlistList.replaceChildren();
    const completed = getCompleted();

    allTracks.forEach((track, index) => {
      const itemRow = node('div', null, 'library-playlist-item');
      itemRow.setAttribute('role', 'listitem');
      itemRow.dataset.index = String(index);
      itemRow.dataset.key = track.key;
      itemRow.dataset.kind = track.kind;

      if (index === currentTrackIndex) {
        itemRow.classList.add('is-active');
      }

      // Ikonka typu média
      const mediaIcon = node('span', '', 'library-item-icon');
      mediaIcon.textContent = track.kind === 'video' ? '🎬' : track.kind === 'audio' ? '🎵' : '📄';

      // Textová část: Titulek + podtitul
      const copyWrap = node('div', null, 'library-item-copy');
      const itemTitle = node('strong', track.title, 'library-item-title');
      const itemSub = node('small', track.weekTitle || (track.kind === 'video' ? 'Video' : track.kind === 'audio' ? 'Audio' : 'PDF'), 'library-item-sub');
      copyWrap.append(itemTitle, itemSub);

      // Stavová část vpravo
      const rightWrap = node('div', null, 'library-item-actions');
      if (completed[track.key]) {
        const checkIcon = node('span', '✓', 'library-check-done');
        checkIcon.title = 'Dokončené';
        rightWrap.append(checkIcon);
      }

      if (index === currentTrackIndex && isPlaying) {
        const activeBadge = node('span', 'Prehráva sa', 'library-badge-active');
        rightWrap.append(activeBadge);
      } else {
        const playBtn = node('button', track.kind === 'pdf' ? 'Otvoriť' : 'Prehrať', 'button outline library-play-btn');
        playBtn.type = 'button';
        rightWrap.append(playBtn);
      }

      itemRow.append(mediaIcon, copyWrap, rightWrap);
      playlistList.append(itemRow);

      // Kliknutím na položku spustíme alebo prepneme prehrávanie
      itemRow.addEventListener('click', () => {
        if (index === currentTrackIndex && activePlayer) {
          if (activePlayer.paused) {
            activePlayer.play().catch(() => {});
          } else {
            activePlayer.pause();
          }
        } else {
          selectTrack(index, true);
        }
      });
    });
  };

  // --- VÝBĚR A PŘEHRÁNÍ STOPY ---
  const selectTrack = async (index, autoPlay = true) => {
    if (index < 0 || index >= allTracks.length) return;
    currentTrackIndex = index;
    const track = allTracks[index];

    // Aktualizace indikátoru a tlačítek v navigační liště pod videem
    trackIndicator.textContent = `Stopa ${index + 1} z ${allTracks.length}`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === allTracks.length - 1;

    updateDetailCard(track);
    renderPlaylist();

    // Označit jako dokončené
    setCompleted(track.key);
    updateProgressPill();

    // Scroll playlistu k aktivní položce
    const activeItem = playlistList.querySelector(`.library-playlist-item[data-index="${index}"]`);
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    await playItem(track, autoPlay);
  };

  // --- PŘEHRÁNÍ POLOŽKY (API + HTML5 PŘEHRÁVAČ) ---
  const playItem = async (item, autoPlay = true) => {
    stopPlayer();
    isPlaying = false;
    document.dispatchEvent(new CustomEvent('ana:media-play'));

    const product = products.get(item.productId);
    if (!product) return;

    if (item.kind === 'pdf') {
      if (!autoPlay) return;
      const popup = window.open('about:blank', '_blank');
      if (popup) popup.opener = null;
      try {
        const access = await api.getMediaAccess({ product_id: product.id, media_key: item.key });
        if (!access.ok) throw Error(access.message || failMessage);
        const url = new URL(access.url, location.origin);
        if (popup) popup.location.replace(url.href);
      } catch (error) {
        popup?.close();
        showError(playerBox, error.message || failMessage);
      }
      return;
    }

    // Video nebo audio
    const version = ++requestVersion;
    try {
      let mediaUrl = item.previewUrl || null;
      let watermark = null;

      if (!mediaUrl) {
        try {
          const access = await api.getMediaAccess({ product_id: product.id, media_key: item.key });
          if (version !== requestVersion) return;
          if (access?.ok && access.url) {
            mediaUrl = access.url;
            watermark = access.watermark || null;
          } else if (access && !access.ok) {
            throw Error(access.message || failMessage);
          }
        } catch (apiErr) {
          if (!autoPlay) return;
          throw apiErr;
        }
      }

      if (!mediaUrl) return;

      const url = new URL(mediaUrl, location.origin);
      const player = document.createElement('video');
      player.controls = true;
      player.preload = 'metadata';
      player.playsInline = true;
      player.setAttribute('controlsList', 'nodownload');
      player.dataset.libraryPlayer = '';

      if (item.kind === 'audio') {
        player.poster = '/assets/hero-forest.jpg';
      }

      playerBox.replaceChildren(player);
      activePlayer = player;

      if (watermark) {
        playerBox.append(node('p', watermark, 'library-watermark'));
      }

      player.addEventListener('play', () => {
        isPlaying = true;
        renderPlaylist();
      });

      player.addEventListener('pause', () => {
        isPlaying = false;
        renderPlaylist();
      });

      if (item.key.toLowerCase().endsWith('.m3u8')) {
        const { default: Hls } = await import('/vendor/hls.min.mjs');
        if (version !== requestVersion) return;
        if (!Hls.isSupported()) throw Error('Tento prehliadač nepodporuje HLS video.');
        hls = new Hls({ enableWorker: false });
        hls.loadSource(url.href);
        hls.attachMedia(player);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            stopPlayer();
            isPlaying = false;
            renderPlaylist();
            showError(playerBox, failMessage);
          }
        });
      } else {
        player.src = url.href;
      }

      player.addEventListener('error', () => {
        isPlaying = false;
        renderPlaylist();
        showError(playerBox, failMessage);
      });

      player.addEventListener('ended', () => {
        isPlaying = false;
        renderPlaylist();
        if (currentTrackIndex < allTracks.length - 1) {
          selectTrack(currentTrackIndex + 1, true);
        }
      });

      if (autoPlay) {
        await player.play().catch(() => {});
      }
    } catch (error) {
      if (version === requestVersion) {
        isPlaying = false;
        renderPlaylist();
        showError(playerBox, error.message || failMessage);
      }
    }
  };

  // --- OVLÁDÁNÍ NAVIGACE (Predchádzajúca / Ďalšia) ---
  prevBtn.addEventListener('click', () => {
    if (currentTrackIndex > 0) {
      selectTrack(currentTrackIndex - 1);
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentTrackIndex < allTracks.length - 1) {
      selectTrack(currentTrackIndex + 1);
    }
  });

  // --- FILTROVÁNÍ A HLEDÁNÍ ---
  let currentFilter = 'all';
  let searchQuery = '';

  const applyFilters = () => {
    const items = playlistList.querySelectorAll('.library-playlist-item');
    items.forEach(el => {
      const kind = el.dataset.kind;
      const title = el.querySelector('.library-item-title')?.textContent?.toLowerCase() || '';
      const matchesFilter = currentFilter === 'all' || kind === currentFilter;
      const matchesSearch = !searchQuery || title.includes(searchQuery);
      el.hidden = !matchesFilter || !matchesSearch;
    });
  };

  filterTabs.addEventListener('click', e => {
    const btn = e.target.closest('.library-filter-btn');
    if (!btn) return;
    filterTabs.querySelectorAll('.library-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    currentFilter = btn.dataset.filter || 'all';
    applyFilters();
  });

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    applyFilters();
  });

  // Inicializace první stopy
  selectTrack(0, false);

  return stopPlayer;
}

function showError(container, message) {
  const existing = container.querySelector('.library-error');
  if (existing) {
    existing.textContent = message;
    return;
  }
  const error = node('p', message, 'library-error form-status');
  error.setAttribute('role', 'status');
  container.append(error);
}

function showLockedState(target) {
  const box = node('div', null, 'empty-state locked-library');
  box.append(
    node('p', 'ZAMKNUTÁ KNIŽNICA', 'eyebrow'),
    node('h2', 'Tento priestor čaká na vás.'),
    node('p', 'Zakúpené programy a súbory sa zobrazia po prihlásení.'),
    Object.assign(node('a', 'Prihlásiť sa', 'button'), { href: '/prihlasenie' })
  );
  target.replaceChildren(box);
}
