(() => {
  'use strict';

  if (window.__snDownloaderLoaded) return;
  window.__snDownloaderLoaded = true;

  const DOWNLOAD_ICON = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor"
            stroke-width="2" stroke-linecap="round"/>
    </svg>`;

  const STYLE = `
    .sn-dl-li { display: inline-flex; align-items: center; }
    .sn-dl-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      opacity: .65;
      transition: opacity .15s ease, background-color .15s ease;
    }
    .sn-dl-btn:hover { opacity: 1; background: rgba(128, 128, 128, .18); }
    .sn-dl-btn:focus-visible { outline: 2px solid #14b8a6; outline-offset: 1px; }
    .sn-dl-btn.sn-busy { opacity: .45; pointer-events: none; }
    .sn-dl-btn.sn-busy svg { animation: sn-pulse .8s ease-in-out infinite alternate; }
    @keyframes sn-pulse { from { transform: translateY(0); } to { transform: translateY(2px); } }
    #sn-dl-toast {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483647;
      max-width: 340px;
      padding: 11px 15px;
      border-radius: 10px;
      background: #1f2937;
      color: #fff;
      font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
      box-shadow: 0 8px 28px rgba(0, 0, 0, .28);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity .18s ease, transform .18s ease;
      pointer-events: none;
    }
    #sn-dl-toast.sn-show { opacity: 1; transform: translateY(0); }
    #sn-dl-toast.sn-error { background: #991b1b; }
  `;

  let typesenseConfig = null;
  let toastTimer = null;
  let scanQueued = false;

  function addStyle() {
    if (document.getElementById('sn-dl-style')) return;
    const style = document.createElement('style');
    style.id = 'sn-dl-style';
    style.textContent = STYLE;
    (document.head || document.documentElement).appendChild(style);
  }

  function readTypesenseConfig() {
    if (typesenseConfig) return typesenseConfig;

    for (const script of document.querySelectorAll('script')) {
      const text = script.textContent || '';
      const marker = 'var dynamic_data = ';
      const start = text.indexOf(marker);
      if (start === -1) continue;

      let raw = text.slice(start + marker.length).trim();
      if (raw.endsWith(';')) raw = raw.slice(0, -1);

      try {
        const data = JSON.parse(raw);
        const nodeList = data.typesenseNodes;
        const nodeHost = nodeList && (nodeList['0'] || Object.values(nodeList)[0]);
        const host = nodeHost || data.typesenseSearchHost;

        if (host && data.typesenseSearchKey) {
          typesenseConfig = {
            host,
            key: data.typesenseSearchKey,
            collection: data.typesenseSearchCollection
          };
          return typesenseConfig;
        }
      } catch (_) {
        /* bu script değil, devam et */
      }
    }

    return null;
  }

  function showToast(message, isError = false) {
    let toast = document.getElementById('sn-dl-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sn-dl-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.toggle('sn-error', isError);
    toast.classList.add('sn-show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('sn-show'), 4000);
  }

  function getTitle(teaser) {
    const description = teaser.querySelector('.audio-description');
    if (description && description.textContent.trim()) {
      return description.textContent.trim();
    }

    const heading = teaser.querySelector('h1, h2, h3');
    if (heading && heading.textContent.trim()) {
      return heading.textContent.trim();
    }

    return document.querySelector('h1')?.textContent?.trim() || document.title.replace(/\s*\|\s*Soundsnap\s*$/, '');
  }

  function getNid(teaser) {
    const nidEl = teaser.querySelector('[data-nid]');
    if (nidEl?.dataset?.nid) return nidEl.dataset.nid;

    if (teaser.id && teaser.id.startsWith('node-')) {
      return teaser.id.slice('node-'.length);
    }

    return null;
  }

  async function resolveFileUrl(filepath) {
    const mp3Path = filepath.replace(/\.[^./]+$/, '') + '.mp3';
    const playUrl = `https://www.soundsnap.com/play?t=e&p=${encodeURI(mp3Path)}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(playUrl, {
        credentials: 'same-origin',
        redirect: 'follow',
        cache: 'no-store'
      });

      const finalUrl = response.url || '';
      if (response.ok && finalUrl.includes('/transcode/')) {
        response.body?.cancel?.()?.catch?.(() => {});
        return finalUrl;
      }

      response.body?.cancel?.()?.catch?.(() => {});
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    throw new Error('Ses dosyası hazırlanamadı. Sesi sayfada bir kez oynatıp tekrar deneyin.');
  }

  async function download(button, teaser) {
    const nid = getNid(teaser);
    const title = getTitle(teaser);

    if (!nid) {
      showToast('Ses kimliği bulunamadı. Sayfayı yenileyip tekrar deneyin.', true);
      return;
    }

    const config = readTypesenseConfig();
    if (!config) {
      showToast('Soundsnap sayfa verisi okunamadı. Sayfayı yenileyip tekrar deneyin.', true);
      return;
    }

    button.classList.add('sn-busy');

    try {
      const meta = await chrome.runtime.sendMessage({
        type: 'SN_RESOLVE',
        nid,
        title,
        config
      });

      if (!meta?.ok) {
        throw new Error(meta?.error || 'Bilinmeyen hata');
      }

      const fileUrl = await resolveFileUrl(meta.filepath);

      const saved = await chrome.runtime.sendMessage({
        type: 'SN_SAVE',
        url: fileUrl,
        title: meta.title || title
      });

      if (!saved?.ok) {
        throw new Error(saved?.error || 'İndirme başlatılamadı');
      }

      showToast(`İndiriliyor: ${meta.title || title}`);
    } catch (error) {
      const message = error?.message || String(error);
      showToast(`İndirilemedi: ${message}`, true);
    } finally {
      button.classList.remove('sn-busy');
    }
  }

  function decorate(teaser) {
    if (!(teaser instanceof HTMLElement)) return;
    if (teaser.querySelector('.sn-dl-li')) return;
    if (!getNid(teaser)) return;

    const actions = teaser.querySelector('.audio-actions ul');
    if (!actions) return;

    const item = document.createElement('li');
    item.className = 'sn-dl-li';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sn-dl-btn';
    button.title = 'MP3 olarak indir';
    button.setAttribute('aria-label', 'MP3 olarak indir');
    button.innerHTML = DOWNLOAD_ICON;

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      download(button, teaser);
    });

    item.appendChild(button);
    actions.insertBefore(item, actions.firstChild);
  }

  function scan(root = document) {
    if (root instanceof Element && root.matches('.ojoo-teaser')) decorate(root);
    root.querySelectorAll?.('.ojoo-teaser').forEach(decorate);
  }

  function scheduleScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      scan(document);
    });
  }

  addStyle();
  scan(document);

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
})();
