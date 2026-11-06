#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SITE = 'https://www.soundsnap.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const DEFAULT_OUT = path.resolve('soundsnap-downloads');
const SORTS = {
  relevance: null,
  plays: 'audio.playCount:desc',
  downloads: 'audio.downloadCount:desc',
  duration: 'audio.playTime:asc',
  'duration-desc': 'audio.playTime:desc',
  newest: 'created:desc',
  title: 'title:asc'
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const color = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = (text) => color('1', text);
const dim = (text) => color('2', text);
const cyan = (text) => color('36', text);
const green = (text) => color('32', text);
const red = (text) => color('31', text);
const yellow = (text) => color('33', text);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class InputEnded extends Error {
  constructor() {
    super('Girdi sona erdi');
    this.name = 'InputEnded';
  }
}

class HttpSession {
  constructor() {
    this.cookies = new Map();
  }

  storeCookies(response) {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      const pair = cookie.split(';', 1)[0];
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  cookieHeader(url) {
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      return '';
    }
    if (host !== 'soundsnap.com' && !host.endsWith('.soundsnap.com')) return '';
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  async fetch(url, options = {}) {
    const headers = new Headers(options.headers ?? {});
    headers.set('user-agent', USER_AGENT);
    headers.set('accept-language', 'tr,en;q=0.8');

    const cookie = this.cookieHeader(url);
    if (cookie) headers.set('cookie', cookie);

    const response = await fetch(url, {
      ...options,
      headers,
      redirect: options.redirect ?? 'follow'
    });

    this.storeCookies(response);
    return response;
  }
}

function parseArguments(argv) {
  const options = {
    _: [],
    tags: [],
    limit: 10,
    page: 1,
    out: DEFAULT_OUT,
    sort: 'relevance',
    json: false,
    pick: false,
    all: false,
    help: false,
    version: false
  };

  const valueFlags = new Set([
    'limit', 'page', 'category', 'tag', 'library', 'min-duration', 'max-duration',
    'sort', 'out', 'search', 'duration', 'size'
  ]);
  const shortFlags = {
    n: 'limit', p: 'page', c: 'category', t: 'tag', l: 'library', o: 'out',
    s: 'search', h: 'help', v: 'version', d: 'duration', z: 'size'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      options._.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      options._.push(arg);
      continue;
    }

    let key;
    let value = true;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        key = arg.slice(2, eq);
        value = arg.slice(eq + 1);
      } else {
        key = arg.slice(2);
        if (valueFlags.has(key)) value = argv[++i];
      }
    } else {
      key = shortFlags[arg.slice(1)];
      if (!key) throw new Error(`Bilinmeyen parametre: ${arg}`);
      if (valueFlags.has(key)) value = argv[++i];
    }

    if (value === undefined) throw new Error(`\`${arg}\` için bir değer gerekli`);

    switch (key) {
      case 'limit':
      case 'page':
        options[key] = Number(value);
        break;
      case 'tag':
        options.tags.push(...String(value).split(',').map((tag) => tag.trim()).filter(Boolean));
        break;
      case 'json':
        options.json = true;
        break;
      case 'pick':
        options.pick = true;
        break;
      case 'all':
        options.all = true;
        break;
      case 'help':
        options.help = true;
        break;
      case 'version':
        options.version = true;
        break;
      case 'duration': {
        const [min, max] = String(value).split('-');
        if (min) options.minDuration = Number(min);
        if (max) options.maxDuration = Number(max);
        break;
      }
      case 'size': {
        const [min, max] = String(value).split('-');
        if (min) options.minSize = Number(min);
        if (max) options.maxSize = Number(max);
        break;
      }
      default:
        options[key] = value;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error('--limit 1 veya daha büyük bir sayı olmalı');
  }
  if (!Number.isFinite(options.page) || options.page < 1) {
    throw new Error('--page 1 veya daha büyük bir sayı olmalı');
  }

  options.limit = Math.min(options.limit, 100);
  return options;
}

function printHelp() {
  console.log(`
${bold('Soundsnap CLI')} — terminalden ses ara ve indir

${bold('Kullanım')}
  soundsnap                               Etkileşimli mod
  soundsnap search <sorgu> [seçenekler]   Ses ara
  soundsnap download <id...> [seçenekler] Kimliğe göre indir
  soundsnap download -s <sorgu> --pick    Arayıp seçerek indir

${bold('Arama seçenekleri')}
  -n, --limit <sayı>        Sayfa başına sonuç (varsayılan: 10)
  -p, --page <sayı>         Sayfa numarası (varsayılan: 1)
  -c, --category <ad>       Kategori filtresi (ör. "Comic & Film Fx")
  -t, --tag <etiketler>     Etiket filtresi, virgülle (hepsi eşleşmeli)
  -l, --library <ad>        Kütüphane/yazar filtresi (ör. Sonigon)
  -d, --duration <min-max>  Süre aralığı, saniye (ör. 1-5)
      --min-duration <sn>   En kısa süre
      --max-duration <sn>   En uzun süre
  -z, --size <min-max>      Dosya boyutu aralığı, MB (ör. 0.5-5)
      --sort <tür>          relevance, plays, downloads, duration,
                            duration-desc, newest, title
      --json                Sonuçları JSON olarak yazdır

${bold('İndirme seçenekleri')}
  -o, --out <klasör>        Çıktı klasörü (varsayılan: ./soundsnap-downloads)
  -s, --search <sorgu>      İndirmeden önce arama yap
      --pick                Arama sonuçlarından seçerek indir
      --all                 Arama sonuçlarının tümünü indir

${bold('Örnekler')}
  soundsnap search "knife stab" -n 20 --sort plays
  soundsnap search "rain" -c "Nature" -d 2-10
  soundsnap search "footsteps" -t "stone,walking" -l Sonigon
  soundsnap download 183305 315923 -o ./sfx
  soundsnap download -s "sweet potato stab" --pick

${dim('Not: İndirilen dosyalar sitedeki önizleme/akış MP3 sürümüdür.')}
`);
}

function parseDynamicData(html) {
  const marker = 'var dynamic_data = ';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('Soundsnap sayfa yapılandırması bulunamadı');

  const end = html.indexOf('</script>', start);
  if (end === -1) throw new Error('Soundsnap sayfa yapılandırması okunamadı');

  let raw = html.slice(start + marker.length, end).trim();
  if (raw.endsWith(';')) raw = raw.slice(0, -1);

  const data = JSON.parse(raw);
  const nodes = data.typesenseNodes;
  const host = (nodes && (nodes['0'] || Object.values(nodes)[0])) || data.typesenseSearchHost;

  if (!host || !data.typesenseSearchKey || !data.typesenseSearchCollection) {
    throw new Error('Soundsnap arama yapılandırması eksik');
  }

  return {
    host,
    key: data.typesenseSearchKey,
    collection: data.typesenseSearchCollection
  };
}

async function bootstrap(session) {
  const response = await session.fetch(`${SITE}/`);
  if (!response.ok) throw new Error(`Soundsnap açılamadı (HTTP ${response.status})`);
  const html = await response.text();
  return parseDynamicData(html);
}

function escapeFilterValue(value) {
  return String(value).replace(/`/g, "'").trim();
}

function buildFilter(options) {
  const filters = [];

  if (options.category) {
    const value = escapeFilterValue(options.category);
    filters.push(
      `(vocab.category.lvl.0:=\`${value}\` || vocab.category.lvl.1:=\`${value}\`)`
    );
  }

  for (const tag of options.tags) {
    filters.push(`vocab.tag.name:=\`${escapeFilterValue(tag)}\``);
  }

  if (options.library) {
    filters.push(`user.name:=\`${escapeFilterValue(options.library)}\``);
  }

  if (Number.isFinite(options.minDuration)) {
    filters.push(`audio.playTime:>=${options.minDuration}`);
  }
  if (Number.isFinite(options.maxDuration)) {
    filters.push(`audio.playTime:<=${options.maxDuration}`);
  }
  if (Number.isFinite(options.minSize)) {
    filters.push(`audio.fileSize:>=${Math.round(options.minSize * 1024 * 1024)}`);
  }
  if (Number.isFinite(options.maxSize)) {
    filters.push(`audio.fileSize:<=${Math.round(options.maxSize * 1024 * 1024)}`);
  }

  return filters.join(' && ');
}

function normalize(doc) {
  return {
    id: String(doc.objectID),
    title: doc.title || '(başlıksız)',
    duration: Number(doc['audio.playTime'] ?? 0),
    category: doc['vocab.category.lvl.1'] || doc['vocab.category.lvl.0'] || '',
    library: doc['user.name'] || '',
    filepath: doc['audio.filepath'] || '',
    tags: Array.isArray(doc['vocab.tag.name']) ? doc['vocab.tag.name'] : [],
    size: Number(doc['audio.fileSize'] ?? 0),
    plays: Number(doc['audio.playCount'] ?? 0),
    downloads: Number(doc['audio.downloadCount'] ?? 0),
    url: doc.url ? `${SITE}/${doc.url}` : ''
  };
}

async function search(config, options) {
  const params = new URLSearchParams({
    q: options.search || '*',
    query_by: 'title,body,vocab.tag.name',
    query_by_weights: '4,2,1',
    per_page: String(options.limit),
    page: String(options.page),
    num_typos: '2'
  });

  const filter = buildFilter(options);
  if (filter) params.set('filter_by', filter);

  if (options.sort && options.sort !== 'relevance') {
    const sort = SORTS[options.sort] || options.sort;
    params.set('sort_by', sort);
  }

  const url = `https://${config.host}/collections/${encodeURIComponent(config.collection)}` +
    `/documents/search?${params.toString()}`;

  const response = await fetch(url, {
    headers: { 'x-typesense-api-key': config.key },
    cache: 'no-store'
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || `Arama başarısız (HTTP ${response.status})`);
  }

  return {
    hits: (body.hits ?? []).map((hit) => normalize(hit.document)),
    found: Number(body.found ?? 0),
    page: Number(body.page ?? options.page),
    outOf: Number(body.out_of ?? 0)
  };
}

function truncate(text, width) {
  const value = String(text).replace(/\s+/g, ' ').trim();
  if (value.length <= width) return value.padEnd(width);
  return `${value.slice(0, Math.max(0, width - 1))}…`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '-';
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m${String(rest).padStart(2, '0')}s`;
}

function formatSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function printResults(result, startIndex = 1) {
  const columns = Math.max(70, process.stdout.columns || 100);
  const titleWidth = Math.max(24, Math.min(46, columns - 62));
  const categoryWidth = Math.max(12, Math.min(24, columns - titleWidth - 44));
  const libraryWidth = 14;

  const header =
    `${'#'.padStart(3)}  ${'ID'.padEnd(8)}  ${'Süre'.padEnd(7)}  ` +
    `${'Başlık'.padEnd(titleWidth)}  ${'Kategori'.padEnd(categoryWidth)}  Kütüphane`;
  console.log(dim(header));
  console.log(dim('-'.repeat(Math.min(columns, header.length))));

  result.hits.forEach((hit, index) => {
    const number = String(startIndex + index).padStart(3);
    console.log(
      `${cyan(number)}  ${hit.id.padEnd(8)}  ${formatDuration(hit.duration).padEnd(7)}  ` +
      `${truncate(hit.title, titleWidth)}  ${truncate(hit.category, categoryWidth)}  ` +
      `${truncate(hit.library, libraryWidth)}`
    );
  });
}

function parseSelection(input, count) {
  const normalized = input.trim().toLowerCase();
  if (normalized === 'all' || normalized === 'a' || normalized === '*') {
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  const selected = new Set();
  for (const part of input.split(',')) {
    const value = part.trim();
    if (!value) continue;
    const range = value.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let i = Math.min(start, end); i <= Math.max(start, end); i += 1) {
        if (i >= 1 && i <= count) selected.add(i);
      }
      continue;
    }
    const number = Number(value);
    if (Number.isInteger(number) && number >= 1 && number <= count) {
      selected.add(number);
    }
  }

  return [...selected].sort((a, b) => a - b);
}

function sanitizeFilename(title) {
  const base = String(title || 'soundsnap-sound')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 140);
  return `${base || 'soundsnap-sound'}.mp3`;
}

async function resolveSignedUrl(session, sound) {
  if (!sound.filepath) throw new Error('Ses dosyası yolu bulunamadı');

  const mp3Path = sound.filepath.replace(/\.[^./]+$/, '') + '.mp3';
  const playUrl = `${SITE}/play?t=e&p=${encodeURI(mp3Path)}`;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await session.fetch(playUrl, {
      redirect: 'manual',
      headers: { referer: `${SITE}/` }
    });

    const location = response.headers.get('location');
    if (location) {
      const absolute = new URL(location, playUrl).href;
      if (absolute.includes('/transcode/')) {
        await response.arrayBuffer().catch(() => {});
        return absolute;
      }
    }

    await response.arrayBuffer().catch(() => {});
    if (attempt < 6) await sleep(1200);
  }

  throw new Error('Ses dosyası hazırlanamadı; birkaç saniye sonra tekrar dene');
}

async function saveStream(response, targetPath) {
  if (!response.body) throw new Error('Sunucu boş yanıt döndürdü');

  const partial = `${targetPath}.part`;
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
  await fsp.rename(partial, targetPath);
}

function uniquePath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const parsed = path.parse(targetPath);
  for (let i = 2; i < 1000; i += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name} (${i})${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Benzersiz dosya adı oluşturulamadı');
}

async function downloadSound(session, sound, outDir) {
  const signedUrl = await resolveSignedUrl(session, sound);
  const response = await session.fetch(signedUrl);
  if (!response.ok) throw new Error(`Dosya indirilemedi (HTTP ${response.status})`);

  const target = uniquePath(path.join(outDir, sanitizeFilename(sound.title)));
  await saveStream(response, target);

  const size = (await fsp.stat(target)).size;
  return { path: target, size };
}

async function downloadMany(session, config, sounds, outDir) {
  let success = 0;
  let failed = 0;

  for (const sound of sounds) {
    process.stdout.write(`${cyan('↓')} ${sound.title} ... `);
    try {
      const saved = await downloadSound(session, sound, outDir);
      success += 1;
      console.log(green('tamam') + dim(` (${formatSize(saved.size)})`));
      console.log(dim(`   ${saved.path}`));
    } catch (error) {
      failed += 1;
      console.log(red('hata'));
      console.log(dim(`   ${error.message}`));
    }
  }

  console.log('');
  console.log(
    `${green(`${success} indirildi`)}` +
    (failed ? `, ${red(`${failed} başarısız`)}` : '') +
    dim(` → ${outDir}`)
  );
}

async function fetchByIds(config, ids) {
  const sounds = [];
  for (const id of ids) {
    const url = `https://${config.host}/collections/${encodeURIComponent(config.collection)}` +
      `/documents/search?q=*&filter_by=objectID%3A${encodeURIComponent(id)}&per_page=1`;
    const response = await fetch(url, {
      headers: { 'x-typesense-api-key': config.key },
      cache: 'no-store'
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || `Ses bilgisi alınamadı (${id})`);
    const hit = body?.hits?.[0]?.document;
    if (!hit) throw new Error(`Ses bulunamadı: ${id}`);
    sounds.push(normalize(hit));
  }
  return sounds;
}

function configureInteractiveSearch(baseOptions) {
  return {
    ...baseOptions,
    search: baseOptions.search || '',
    tags: baseOptions.tags ? [...baseOptions.tags] : []
  };
}

async function interactive(session, config, options, rl) {
  const lines = rl[Symbol.asyncIterator]();

  const ask = async (question, fallback = '') => {
    process.stdout.write(question);
    const { value, done } = await lines.next();
    if (done) throw new InputEnded();
    const answer = String(value ?? '').trim();
    return answer || fallback;
  };

  console.log('');
  console.log(bold('Soundsnap CLI') + dim(' — çıkmak için q'));
  console.log('');

  const outDir = path.resolve(options.out);

  while (true) {
    const query = await ask(cyan('Arama: '));
    if (!query) continue;
    if (query.toLowerCase() === 'q') break;

    const category = await ask('Kategori (boş = yok): ');
    const tags = await ask('Etiketler (virgülle, boş = yok): ');
    const duration = await ask('Süre sn (ör. 1-5, boş = yok): ');
    const limitRaw = await ask('Sonuç sayısı [10]: ', '10');
    const sortRaw = await ask('Sıralama [relevance/plays/downloads/duration/newest]: ');

    const searchOptions = configureInteractiveSearch(options);
    searchOptions.search = query;
    searchOptions.category = category || undefined;
    searchOptions.library = options.library || undefined;
    searchOptions.tags = tags ? tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
    searchOptions.limit = Math.max(1, Math.min(100, Number(limitRaw) || 10));
    searchOptions.page = 1;
    searchOptions.sort = sortRaw || 'relevance';

    if (duration) {
      const [min, max] = duration.split('-');
      searchOptions.minDuration = min ? Number(min) : undefined;
      searchOptions.maxDuration = max ? Number(max) : undefined;
    }

    let result;
    try {
      result = await search(config, searchOptions);
    } catch (error) {
      console.log(red(`Arama hatası: ${error.message}`));
      continue;
    }

    if (!result.hits.length) {
      console.log(yellow('Sonuç bulunamadı.'));
      console.log('');
      continue;
    }

    console.log('');
    printResults(result);
    console.log('');
    console.log(dim(`${result.found.toLocaleString('tr-TR')} sonuç, sayfa ${result.page}`));
    console.log('');

    const pick = await ask(
      'İndirilecek numaralar (1,3-5 / all / Enter = yeni arama / q = çık): '
    );
    if (pick.toLowerCase() === 'q') break;
    if (!pick) {
      console.log('');
      continue;
    }

    const indices = parseSelection(pick, result.hits.length);
    if (!indices.length) {
      console.log(yellow('Geçerli bir seçim yapılmadı.'));
      console.log('');
      continue;
    }

    const selected = indices.map((index) => result.hits[index - 1]);
    console.log('');
    await downloadMany(session, config, selected, outDir);
    console.log('');
  }

  rl.close();
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.version) {
    console.log('soundsnap-cli 1.0.0');
    return;
  }
  if (options.help || options._[0] === 'help') {
    printHelp();
    return;
  }

  const command = options._[0];
  const session = new HttpSession();
  const config = await bootstrap(session);

  if (!command) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await interactive(session, config, options, rl);
    return;
  }

  if (command === 'search') {
    const query = options._.slice(1).join(' ');
    options.search = query || '*';
    const result = await search(config, options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (!result.hits.length) {
      console.log(yellow('Sonuç bulunamadı.'));
      return;
    }

    printResults(result);
    console.log('');
    console.log(dim(`${result.found.toLocaleString('tr-TR')} sonuç, sayfa ${result.page} / ${Math.max(1, Math.ceil(result.found / options.limit))}`));
    console.log(dim(`İndirmek için: soundsnap download ${result.hits.map((hit) => hit.id).join(' ')}`));
    return;
  }

  if (command === 'download' || command === 'get') {
    let sounds;

    if (options.search) {
      const result = await search(config, { ...options, page: 1 });
      if (!result.hits.length) {
        console.log(yellow('Sonuç bulunamadı.'));
        return;
      }

      if (!options.pick && !options.all) {
        throw new Error('Seçmek için --pick, tüm sonuçlar için --all kullan');
      }

      printResults(result);

      if (options.pick) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const lines = rl[Symbol.asyncIterator]();
        process.stdout.write('\nİndirilecek numaralar (1,3-5 / all): ');
        const { value, done } = await lines.next();
        rl.close();
        if (done) throw new InputEnded();
        const answer = String(value ?? '').trim();
        const indices = parseSelection(answer, result.hits.length);
        if (!indices.length) throw new Error('Geçerli bir seçim yapılmadı');
        sounds = indices.map((index) => result.hits[index - 1]);
      } else {
        sounds = result.hits;
      }
    } else {
      const ids = options._.slice(1);
      if (!ids.length) throw new Error('En az bir ses kimliği veya -s <sorgu> gerekli');
      sounds = await fetchByIds(config, ids);
    }

    const outDir = path.resolve(options.out);
    await downloadMany(session, config, sounds, outDir);
    return;
  }

  throw new Error(`Bilinmeyen komut: ${command}\n\n${bold('Yardım:')} soundsnap --help`);
}

main().catch((error) => {
  if (error instanceof InputEnded) {
    console.log('');
    process.exit(0);
  }
  console.error(red(`Hata: ${error.message}`));
  process.exit(1);
});
