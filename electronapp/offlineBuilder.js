const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL, fileURLToPath } = require('node:url');
const https = require('node:https');
const http = require('node:http');

const DEFAULT_SOURCE_URL = 'https://c.n4v.ru/test.html';

function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

function guessExtFromContentType(ct) {
  const t = (ct || '').split(';')[0].trim().toLowerCase();
  const map = {
    'text/css': '.css',
    'text/javascript': '.js',
    'application/javascript': '.js',
    'application/x-javascript': '.js',
    'application/json': '.json',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/x-icon': '.ico',
    'font/woff2': '.woff2',
    'font/woff': '.woff',
    'application/font-woff2': '.woff2',
    'application/font-woff': '.woff',
    'text/html': '.html'
  };
  return map[t] || '';
}

async function fetchBuffer(urlStr, timeoutMs = 30000) {
  if (!/^[a-z]+:\/\//i.test(urlStr)) {
    const localPath = path.resolve(urlStr);
    const buf = await fsp.readFile(localPath);
    return { ok: true, status: 200, headers: {}, buf };
  }
  if (urlStr.startsWith('file://')) {
    const filePath = fileURLToPath(urlStr);
    const buf = await fsp.readFile(filePath);
    return { ok: true, status: 200, headers: {}, buf };
  }
  if (typeof fetch === 'function') {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(urlStr, { signal: ac.signal, redirect: 'follow' });
      const buf = Buffer.from(await res.arrayBuffer());
      return { ok: res.ok, status: res.status, headers: Object.fromEntries(res.headers.entries()), buf };
    } finally {
      clearTimeout(t);
    }
  }

  const u = new URL(urlStr);
  const mod = u.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = mod.get(urlStr, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: res.headers,
          buf: Buffer.concat(chunks)
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
  });
}

function isDownloadableUrl(u) {
  if (!u) return false;
  const x = u.trim();
  if (!x) return false;
  if (x.startsWith('data:')) return false;
  if (x.startsWith('blob:')) return false;
  if (x.startsWith('mailto:')) return false;
  if (x.startsWith('javascript:')) return false;
  if (x.startsWith('#')) return false;
  return true;
}

function pickFilename(urlStr, headers) {
  const u = new URL(urlStr);
  const base = path.basename(u.pathname || '') || 'asset';
  let ext = path.extname(base);

  if (!ext) {
    const ct = headers && (headers['content-type'] || headers['Content-Type']);
    ext = guessExtFromContentType(ct);
  }

  return sha1(urlStr).slice(0, 16) + (ext || '');
}

async function ensureEmptyDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  await Promise.all(entries.map(async (e) => {
    const p = path.join(dir, e.name);
    await fsp.rm(p, { recursive: true, force: true });
  }));
}

async function atomicSwapDir(tmpDir, finalDir) {
  const oldDir = finalDir + '.old';
  await fsp.rm(oldDir, { recursive: true, force: true }).catch(()=>{});
  if (fs.existsSync(finalDir)) {
    await fsp.rename(finalDir, oldDir).catch(async () => {
      await fsp.rm(finalDir, { recursive: true, force: true }).catch(()=>{});
    });
  }
  await fsp.rename(tmpDir, finalDir);
  await fsp.rm(oldDir, { recursive: true, force: true }).catch(()=>{});
}

function stripBaseTags(html) {
  return html.replace(/<base\b[^>]*>/gi, '');
}

function stripSRI(tagHtml) {
  return tagHtml
    .replace(/\s+integrity\s*=\s*["'][^"']*["']/i, '')
    .replace(/\s+crossorigin\s*=\s*["'][^"']*["']/i, '')
    .replace(/\s+referrerpolicy\s*=\s*["'][^"']*["']/i, '');
}

function rewriteTagAttr(tagHtml, attr, newVal) {
  const re = new RegExp(`\\b${attr}\\s*=\\s*["'][^"']*["']`, 'i');
  if (re.test(tagHtml)) {
    return tagHtml.replace(re, `${attr}="${newVal}"`);
  }
  return tagHtml;
}

function setDocumentTitle(html, titleText) {
  try {
    const t = String(titleText || '').trim();
    if (!t) return html;
    if (/<title\b[^>]*>.*?<\/title>/is.test(html)) {
      return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${t}</title>`);
    }
    // Insert into <head> if possible
    if (/<head\b[^>]*>/i.test(html)) {
      return html.replace(/<head\b[^>]*>/i, (m) => m + `\n  <title>${t}</title>`);
    }
    return `<title>${t}</title>\n` + html;
  } catch {
    return html;
  }
}

// fetchBufferImpl(urlStr, timeoutMs) => Promise<{ ok, status, headers, buf }>
async function buildOfflineSite({
  sourceUrl = DEFAULT_SOURCE_URL,
  offlineRootDir,
  offlineTitle = 'Калькулятор 3D-печати (оффлайн)',
  onProgress = () => {},
  fetchBufferImpl = fetchBuffer,
  timeoutMs = 30000
}) {
  const baseUrl = new URL(sourceUrl);
  const tmpDir = path.join(offlineRootDir, '_tmp_' + Date.now());
  const tmpAssets = path.join(tmpDir, 'assets');
  await ensureEmptyDir(tmpDir);
  await fsp.mkdir(tmpAssets, { recursive: true });

  const mapUrlToLocal = new Map();
  const mapUrlToAssetName = new Map();
  const downloaded = [];

  const progress = (message, extra) => onProgress({ message, ...extra });

  progress('Скачиваю HTML…', { step: 'html' });
  const htmlRes = await fetchBufferImpl(sourceUrl, timeoutMs);
  if (!htmlRes.ok) throw new Error(`Не удалось скачать HTML (${htmlRes.status})`);

  const htmlHash = sha1(htmlRes.buf);
  let html = htmlRes.buf.toString('utf-8');
  html = stripBaseTags(html);
  html = setDocumentTitle(html, offlineTitle);
async function downloadAsset(absUrl) {
    if (mapUrlToLocal.has(absUrl)) return mapUrlToLocal.get(absUrl);

    progress('Скачиваю ресурс…', { step: 'asset', url: absUrl });
    const res = await fetchBufferImpl(absUrl, timeoutMs);
    if (!res.ok) {
      progress('Не удалось скачать ресурс (пропускаю)', { step: 'asset-skip', url: absUrl, status: res.status });
      return null;
    }

    const fname = pickFilename(absUrl, res.headers);
    const dst = path.join(tmpAssets, fname);
    await fsp.writeFile(dst, res.buf);

    const relFromHtml = `assets/${fname}`;
    mapUrlToLocal.set(absUrl, relFromHtml);
    mapUrlToAssetName.set(absUrl, fname);
    downloaded.push({ url: absUrl, file: relFromHtml, size: res.buf.length });
    return relFromHtml;
  }

  async function downloadCssAndRewrite(absCssUrl) {
    const rel = await downloadAsset(absCssUrl);
    if (!rel) return null;

    const fname = mapUrlToAssetName.get(absCssUrl);
    const cssPath = path.join(tmpAssets, fname);

    let css = await fsp.readFile(cssPath, 'utf-8').catch(() => null);
    if (css == null) return rel;

    const importRe = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;?/gi;
    const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

    const cssBase = new URL(absCssUrl);

    const toReplace = [];
    for (const m of css.matchAll(importRe)) {
      const raw = m[1];
      if (!isDownloadableUrl(raw)) continue;
      const abs = new URL(raw, cssBase).toString();
      toReplace.push({ kind: 'import', raw, abs });
    }
    for (const m of css.matchAll(urlRe)) {
      const raw = m[2];
      if (!isDownloadableUrl(raw)) continue;
      const abs = new URL(raw, cssBase).toString();
      toReplace.push({ kind: 'url', raw, abs });
    }

    for (const it of toReplace) {
      const relFromHtml2 = await downloadAsset(it.abs);
      if (!relFromHtml2) continue;
      const fname2 = mapUrlToAssetName.get(it.abs);
      const cssRelative = fname2 ? `${fname2}` : relFromHtml2.replace(/^assets\//, '');
      css = css.replaceAll(it.raw, cssRelative);
    }

    await fsp.writeFile(cssPath, css, 'utf-8');
    return rel;
  }

  async function rewriteInlineStyleBlocks(htmlIn) {
    const styleBlockRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let out = htmlIn;
    const matches = Array.from(out.matchAll(styleBlockRe));
    for (const m of matches) {
      const full = m[0];
      const css = m[1] || '';
      let newCss = css;

      const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
      for (const u of newCss.matchAll(urlRe)) {
        const raw = u[2];
        if (!isDownloadableUrl(raw)) continue;
        const abs = new URL(raw, baseUrl).toString();
        const relFromHtml = await downloadAsset(abs);
        if (!relFromHtml) continue;
        const fname = mapUrlToAssetName.get(abs);
        const cssRel = fname ? `${fname}` : relFromHtml.replace(/^assets\//,'');
        newCss = newCss.replaceAll(raw, cssRel);
      }

      const replaced = full.replace(css, newCss);
      out = out.replace(full, replaced);
    }
    return out;
  }

  progress('Анализирую HTML…', { step: 'scan' });

  const scriptRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const linkRe = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const imgRe = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const srcsetRe = /\bsrcset\s*=\s*["']([^"']+)["']/gi;

  async function processTags(regex, attr, handler) {
    const matches = Array.from(html.matchAll(regex));
    for (const m of matches) {
      const rawUrl = m[1];
      if (!isDownloadableUrl(rawUrl)) continue;

      const abs = new URL(rawUrl, baseUrl).toString();
      const rel = await handler(abs);
      if (!rel) continue;

      const tagStart = m[0];
      let tagNew = rewriteTagAttr(tagStart, attr, rel);
      tagNew = stripSRI(tagNew);
      html = html.replace(tagStart, tagNew);
    }
  }

  await processTags(scriptRe, 'src', downloadAsset);

  const linkMatches = Array.from(html.matchAll(linkRe));
  for (const m of linkMatches) {
    const rawUrl = m[1];
    if (!isDownloadableUrl(rawUrl)) continue;

    const tagStart = m[0];
    const relMatch = tagStart.match(/\brel\s*=\s*["']([^"']+)["']/i);
    const relVal = (relMatch ? relMatch[1] : '').toLowerCase();

    const shouldDownload =
      relVal.includes('stylesheet') ||
      relVal.includes('icon') ||
      relVal.includes('manifest') ||
      relVal.includes('apple-touch-icon');

    if (!shouldDownload) continue;

    const abs = new URL(rawUrl, baseUrl).toString();
    const relPath = relVal.includes('stylesheet')
      ? await downloadCssAndRewrite(abs)
      : await downloadAsset(abs);

    if (!relPath) continue;

    let tagNew = rewriteTagAttr(tagStart, 'href', relPath);
    tagNew = stripSRI(tagNew);
    html = html.replace(tagStart, tagNew);
  }

  await processTags(imgRe, 'src', downloadAsset);

  const srcsetMatches = Array.from(html.matchAll(srcsetRe));
  for (const m of srcsetMatches) {
    const srcsetVal = m[1] || '';
    const parts = srcsetVal.split(',').map(x => x.trim()).filter(Boolean);
    const rewritten = [];
    for (const part of parts) {
      const [u, size] = part.split(/\s+/, 2);
      if (!isDownloadableUrl(u)) { rewritten.push(part); continue; }
      const abs = new URL(u, baseUrl).toString();
      const rel = await downloadAsset(abs);
      if (!rel) { rewritten.push(part); continue; }
      rewritten.push(size ? `${rel} ${size}` : rel);
    }
    const newVal = rewritten.join(', ');
    html = html.replace(srcsetVal, newVal);
  }

  html = await rewriteInlineStyleBlocks(html);

  progress('Записываю офлайн HTML…', { step: 'write-html' });
  await fsp.writeFile(path.join(tmpDir, 'index.html'), html, 'utf-8');

  const meta = {
    sourceUrl,
    builtAt: new Date().toISOString(),
    downloadedCount: downloaded.length,
    downloaded,
    htmlHash
  };
  await fsp.writeFile(path.join(tmpDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

  return { tmpDir, meta };
}

module.exports = { buildOfflineSite, DEFAULT_SOURCE_URL, atomicSwapDir };
