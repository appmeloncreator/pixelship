const fs = require('fs');
const sharp = require('sharp');
const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;
const MAX_REFERENCE_BYTES = 80 * 1024;

function env() {
  const out = {};
  try {
    for (const line of fs.readFileSync('config.env', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) out[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {}
  return out;
}

function safeHttpUrl(value, rejectSocial = false) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || /^127\.|^10\.|^192\.168\.|^169\.254\./.test(host)) return null;
    if (rejectSocial && /(facebook|fbcdn|fbsbx|instagram|cdninstagram)\./i.test(host)) return null;
    return url.href;
  } catch { return null; }
}

async function cleanImage(imageUrl) {
  const safeUrl = safeHttpUrl(imageUrl, true);
  if (!safeUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(safeUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif', 'User-Agent': 'Pixelship/1.0 image-reference-fetcher' },
    });
    if (!response.ok) return null;
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (!type.startsWith('image/')) return null;
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_DOWNLOAD_BYTES) return null;
    const raw = Buffer.from(await response.arrayBuffer());
    if (!raw.length || raw.length > MAX_DOWNLOAD_BYTES) return null;
    const metadata = await sharp(raw, { animated: false }).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 128 || metadata.height < 128) return null;
    let quality = 80, output;
    for (let attempt = 0; attempt < 6; attempt++) {
      output = await sharp(raw, { animated: false }).rotate().resize({ width: 512, height: 512, fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).jpeg({ quality, chromaSubsampling: '4:2:0', mozjpeg: true }).toBuffer();
      if (output.length <= MAX_REFERENCE_BYTES) break;
      quality -= 10;
    }
    if (!output || output.length > MAX_REFERENCE_BYTES) return null;
    return 'data:image/jpeg;base64,' + output.toString('base64');
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function searchImages(query) {
  const key = env().SERPER_API_KEY;
  if (!key) throw new Error('Serper image search is not configured. Add SERPER_API_KEY to .env.');
  const response = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ q: query.replace(/[^a-zA-Z0-9 .&+_-]/g, ' ') + ' official product', num: 20, safe: 'active' }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Serper image search failed with status ' + response.status);
  const results = [];
  const requiredNumbers = query.match(/\b\d+(?:[.-]\d+)*\b/g) || [];
  const exactCandidates = (data.images || []).filter(item => {
    const titleNumbers = String(item.title || '').match(/\b\d+(?:[.-]\d+)*\b/g) || [];
    return requiredNumbers.every(number => titleNumbers.includes(number));
  });
  if (requiredNumbers.length && !exactCandidates.length) throw new Error('No recent image result matched the exact requested model/version number: ' + requiredNumbers.join(', '));
  for (const item of exactCandidates) {
    const image = await cleanImage(item.imageUrl);
    if (!image) continue;
    results.push({ image, title: String(item.title || ''), source: safeHttpUrl(item.link) || '' });
    if (results.length === 5) break;
  }
  if (!results.length) throw new Error('Serper returned results, but none were valid JPEG, PNG, WebP, or GIF images');
  return results;
}

module.exports = { searchImages };
