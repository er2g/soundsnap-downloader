'use strict';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SN_RESOLVE') {
    resolveSound(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === 'SN_SAVE') {
    saveSound(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  return undefined;
});

async function resolveSound({ nid, title, config }) {
  if (!nid) throw new Error('Ses kimliği eksik');
  if (!config?.host || !config?.key || !config?.collection) {
    throw new Error('Soundsnap arama yapılandırması eksik');
  }

  const doc = await findDocument(nid, config);
  const filepath = doc['audio.filepath'] || doc.audio?.filepath;

  if (!filepath) throw new Error('Ses dosyası yolu bulunamadı');

  return {
    filepath,
    title: doc.title || title || 'soundsnap-sound'
  };
}

async function findDocument(nid, config) {
  const url = `https://${config.host}/collections/${encodeURIComponent(config.collection)}` +
    `/documents/search?q=*&filter_by=objectID%3A${encodeURIComponent(nid)}&per_page=1`;

  const response = await fetch(url, {
    headers: { 'X-TYPESENSE-API-KEY': config.key },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Ses bilgisi alınamadı (HTTP ${response.status})`);
  }

  const data = await response.json();
  const doc = data?.hits?.[0]?.document;

  if (!doc) throw new Error('Ses kaydı bulunamadı');

  return doc;
}

async function saveSound({ url, title }) {
  if (!url) throw new Error('İndirme bağlantısı eksik');

  const filename = buildFilename(title);

  const downloadId = await chrome.downloads.download({
    url,
    filename,
    conflictAction: 'uniquify',
    saveAs: false
  });

  return { id: downloadId, filename };
}

function buildFilename(title) {
  const base = String(title || 'soundsnap-sound')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 140);

  return `${base || 'soundsnap-sound'}.mp3`;
}
