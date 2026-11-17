// JepongDevxyz AllDL — api/formats.js
// Anong resolution ang TUNAY na available para sa link na ito?
// Ipinapasa lang sa FB backend (POST /api/formats) — doon nakaupo
// ang yt-dlp, kaya doon lang malalaman ang totoong formats.
//   GET/POST ?url=...  ->  { platform, title, available: ['best','360p',...], best_height }
// TikTok: walang resolution picker (watermark variants lang), kaya 400.
// Zero dependencies — Node fetch lang ang gamit.

import { detectPlatform, extractUrlFromText } from './download.js';

const FB_BACKEND = 'https://jepong-devxyz-fb-dl4u.vercel.app';
// v1.1: ang raw yt-dlp error (bot check + wiki links) ay hindi na
// ipinapakita sa user — maikling Tagalog message na lang.
function friendlyUpstreamError(msg) {
  const m = String(msg || '');
  const low = m.toLowerCase();
  if (low.includes('sign in to confirm') || low.includes('not a bot')) {
    return "Na-block ng YouTube ang server ngayon (bot check). Subukan ulit mamaya, o 360p/MP3 muna.";
  }
  if (low.includes('requested format is not available')) {
    return 'Hindi makuha ang video na ito ngayon. Subukan ang ibang quality o subukan ulit mamaya.';
  }
  return m;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readParams(req) {
  if (req.method === 'POST') {
    const body = req.body;
    if (body && typeof body === 'object') return body;
    if (typeof body === 'string' && body.trim()) {
      try {
        return JSON.parse(body);
      } catch {
        return {};
      }
    }
    return {};
  }
  return req.query || {};
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'GET o POST lang ang pwede dito.' });
  }

  try {
    const params = readParams(req);
    const url = extractUrlFromText(params.url || '');
    if (!url) {
      return res.status(400).json({ error: 'Maglagay ng valid na video link.' });
    }
    const platform = detectPlatform(url);
    if (!platform || platform === 'tiktok') {
      return res.status(400).json({
        error:
          platform === 'tiktok'
            ? 'Walang resolution picker ang TikTok dito.'
            : 'YouTube o Facebook link lang ang pwede dito.',
      });
    }

    const fbRes = await fetch(`${FB_BACKEND}/api/formats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(60000),
    });
    const text = await fbRes.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!fbRes.ok || !data || data.status !== 'success') {
      const msg = friendlyUpstreamError(
        (data && (data.detail || data.message || data.error)) ||
        'Hindi ma-check ang available na resolution ngayon.',
      );
      return res.status(fbRes.status >= 400 ? fbRes.status : 502).json({ error: msg });
    }
    return res.status(200).json({
      platform: data.platform || platform,
      title: data.title || (data.video_info && data.video_info.title) || '',
      available: Array.isArray(data.available) ? data.available : [],
      // Yung qualities na kailangan ng server-side merge (hiwalay ang
      // video at audio) — ang frontend, diretso sa merge endpoint ang
      // tawag para sa mga ito imbes na sa /api/download.
      merged_qualities: Array.isArray(data.merged_qualities) ? data.merged_qualities : [],
      best_height: data.best_height || null,
    });
  } catch (err) {
    console.error('AllDL /api/formats error:', err);
    return res
      .status(500)
      .json({ error: 'Hindi ma-check ang available na resolution ngayon.' });
  }
}
