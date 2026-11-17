// JepongDevxyz AllDL — api/download.js
// Isang endpoint lang para sa lahat: YouTube, TikTok, at Facebook.
// Dinidetect ang platform server-side (hindi pinagkakatiwalaan ang
// label galing sa client), tapos ni-route sa tamang backend:
//   - TikTok  -> tikwm.com/api (walang key, tulad ng original na TT app);
//                dini-detect kung VIDEO, PHOTO slideshow, o MUSIC ang
//                laman (classifyTikTok). Music-page links (/music/...)
//                hindi kayang i-resolve ng tikwm — malinaw na error.
//   - YouTube -> MP3: RapidAPI youtube-mp36 KUNG may RAPIDAPI_KEY,
//                kung wala, naka-fallback sa lumang YT4U backend.
//                MP4: yt-dlp sa FB backend (kailangan ng patch sa FB
//                backend — tingnan ang fb-backend-mp4-patch.md).
//   - Facebook -> lumang FBDL4U backend (FastAPI + yt-dlp sa Render)
// Zero dependencies — Node fetch lang ang gamit.
// GET  ?url=...&format=mp3&quality=best
// POST JSON { url, quality, format }

const UNSUPPORTED_MSG =
  'Hindi suportado ang link na yan. YouTube, TikTok o Facebook link lang.';

const FB_BACKEND = 'https://jepong-devxyz-fb-dl4u.vercel.app';
const YT_BACKEND = 'https://jepong-devxyz-yt-4-u.vercel.app';
const TIKWM_API = 'https://tikwm.com/api/';
const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com';

// Mga quality na tinatanggap ng FB backend — ipinapasa ng buo, walang binabago.
const FB_QUALITIES = new Set(['best', '1080p', '720p', '360p', 'worst', 'mp3']);

// Kunin ang unang http(s) URL sa loob ng text (para ok kahit may
// extra words sa paligid ng na-paste na link).
export function extractUrlFromText(text) {
  if (!text || typeof text !== 'string') return '';
  const m = text.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0].replace(/[.,;:!?)]+$/, '') : '';
}

// Alamin kung anong platform ang link — URL lang ang basehan.
export function detectPlatform(rawUrl) {
  const url = extractUrlFromText(rawUrl || '');
  if (!url) return null;
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  if (
    host === 'youtube.com' ||
    host === 'youtu.be' ||
    host === 'music.youtube.com' ||
    host === 'm.youtube.com'
  ) {
    return 'youtube';
  }
  if (
    host === 'tiktok.com' ||
    host === 'vt.tiktok.com' ||
    host === 'vm.tiktok.com'
  ) {
    return 'tiktok';
  }
  if (
    host === 'facebook.com' ||
    host === 'fb.com' ||
    host === 'fb.watch' ||
    host === 'm.facebook.com' ||
    host === 'web.facebook.com'
  ) {
    return 'facebook';
  }
  return null;
}

// --- TikTok: anong klaseng content ito? (video / photo / music) ---
// TikTok links: /video/<id> (video), /photo/<id> (photo slideshow),
// /music/<slug>-<id> (music page — HINDI sinusuportahan ng tikwm,
// kaya malinaw na error ang ibibigay, hindi generic failure).
export function isTikTokMusicPage(rawUrl) {
  const url = extractUrlFromText(rawUrl || '');
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') === 'tiktok.com' &&
      u.pathname.toLowerCase().startsWith('/music/');
  } catch {
    return false;
  }
}

// I-classify ang tikwm item: photo kapag may images, video kapag may
// play/hdplay, music kapag may music track lang. Isang post, pwedeng
// may kasamang music ang video/photo — kaya flags, hindi lang isang label.
export function classifyTikTok(item) {
  const it = item || {};
  const images = Array.isArray(it.images) ? it.images.filter(Boolean) : [];
  const hasVideo = Boolean(it.play || it.hdplay);
  const musicUrl =
    (it.music_info && it.music_info.play) ||
    (typeof it.music === 'string' ? it.music : '');
  const hasMusic = Boolean(musicUrl);
  const hasPhotos = images.length > 0;
  const contentType = hasPhotos
    ? 'photo'
    : hasVideo
      ? 'video'
      : hasMusic
        ? 'music'
        : 'unknown';
  const music = hasMusic
    ? {
        title:
          (it.music_info && it.music_info.title) || it.music_title || 'TikTok sound',
        author: (it.music_info && it.music_info.author) || '',
        play: musicUrl,
        cover:
          (it.music_info &&
            (it.music_info.cover || it.music_info.cover_hd)) ||
          it.cover ||
          '',
      }
    : null;
  return { contentType, hasVideo, hasPhotos, photoCount: images.length, hasMusic, music };
}

// Orihinal na regex ng YT4U — 11-char video ID lang ang valid.
export function extractYouTubeID(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readParams(req) {
  // GET: galing sa query string. POST: JSON body (string o parsed object).
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

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data, text };
}

// --- TikTok: tikwm, tulad ng original (api/index.js ng TT app) ---
async function handleTikTok(url) {
  // Music page lang (tiktok.com/music/...) — walang resolver para dito
  // ang tikwm (code -1), kaya malinaw na gabay ang error, hindi hula.
  if (isTikTokMusicPage(url)) {
    return {
      status: 400,
      body: {
        error:
          'Music page lang yan — hindi yan ma-download ng diretso. I-paste mo yung video na gumagamit ng sound na yan, at may Audio Track download dun.',
      },
    };
  }
  const { status, data } = await fetchJson(
    `${TIKWM_API}?url=${encodeURIComponent(url)}&hd=1`,
  );
  if (!data || data.code !== 0) {
    const msg =
      (data && (data.msg || data.error)) ||
      'Hindi ma-fetch ang TikTok video. Subukan ulit mamaya.';
    return { status: status === 400 ? 400 : 502, body: { ok: false, error: msg } };
  }
  const item = data.data || {};
  // Gawing absolute ang relative paths, at gawing best stream ang play —
  // eksaktong ginagawa ito ng original na TT backend.
  const best = item.hdplay || item.play;
  if (best) {
    item.play = best;
    item.hdplay = best;
  }
  for (const key of ['play', 'hdplay', 'wmplay']) {
    if (item[key] && item[key].startsWith('/')) {
      item[key] = `https://tikwm.com${item[key]}`;
    }
  }
  // Music track + photos: gawing absolute rin kung relative.
  if (item.music_info && item.music_info.play && item.music_info.play.startsWith('/')) {
    item.music_info.play = `https://tikwm.com${item.music_info.play}`;
  }
  if (Array.isArray(item.images)) {
    item.images = item.images
      .filter(Boolean)
      .map((src) => (src.startsWith('/') ? `https://tikwm.com${src}` : src));
  }
  // I-detect kung video, photo slideshow, o music ang laman.
  const content = classifyTikTok(item);
  return {
    status: 200,
    body: { platform: 'tiktok', ok: true, item, ...content },
  };
}

// --- YouTube: MP3 at MP4 ---
// MP3: RapidAPI youtube-mp36 KUNG may RAPIDAPI_KEY, kung wala,
//      naka-fallback sa lumang YT4U backend (tulad ng dati).
// MP4: yt-dlp sa FB backend (Render) — gumagana ang extraction doon
//      para sa YouTube (title/views nakuha), pero kailangan ng patch sa
//      FB backend (tingnan ang fb-backend-mp4-patch.md) para maglabas
//      siya ng single-file MP4 link imbes na null: kapag YouTube ang
//      URL, single-file mp4 format ang pipiliin, hindi merged DASH.
async function handleYouTube(url, format, quality) {
  const videoId = extractYouTubeID(url);
  if (!videoId) {
    return { status: 400, body: { error: 'Invalid YouTube URL format.' } };
  }
  const fmt = format === 'mp4' ? 'mp4' : 'mp3';

  if (fmt === 'mp4') {
    const q = FB_QUALITIES.has(quality) ? quality : 'best';
    const { status, data } = await fetchJson(`${FB_BACKEND}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, quality: q }),
    });
    if (!data || data.status !== 'success' || !data.download_url) {
      const msg =
        (data && (data.detail || data.message || data.error)) ||
        'Hindi pa makuha ang MP4 ng video na ito. Subukan ang MP3, o subukan ulit mamaya.';
      return { status: status >= 400 ? status : 502, body: { error: msg } };
    }
    const info = data.video_info || {};
    return {
      status: 200,
      body: {
        platform: 'youtube',
        format: 'mp4',
        title: info.title || 'YouTube Video',
        downloadUrl: data.download_url,
        filename: `${(info.title || 'video').replace(/[\\/:*?"<>|]/g, '').trim() || 'video'}.mp4`,
        video_info: info,
      },
    };
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (apiKey) {
    const { data } = await fetchJson(
      `https://${RAPIDAPI_HOST}/dl?id=${videoId}`,
      {
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': RAPIDAPI_HOST,
        },
      },
    );
    if (!data || data.status !== 'ok') {
      return {
        status: 502,
        body: { error: (data && (data.msg || data.error)) || 'Hindi ma-extract ang video details.' },
      };
    }
    return {
      status: 200,
      body: {
        platform: 'youtube',
        format: 'mp3',
        title: data.title,
        downloadUrl: data.link,
        filename: `${data.title}.${format || 'mp3'}`,
      },
    };
  }
  // Walang RAPIDAPI_KEY — i-proxy sa lumang YT4U backend (gumagana pa rin).
  const { status, data } = await fetchJson(
    `${YT_BACKEND}/api/download?url=${encodeURIComponent(url)}&format=${encodeURIComponent(format || 'mp3')}`,
  );
  if (!data || data.error || !data.downloadUrl) {
    return {
      status: 502,
      body: { error: (data && data.error) || 'Hindi ma-process ang video ngayon. Subukan ulit mamaya.' },
    };
  }
  return {
    status: 200,
    body: {
      platform: 'youtube',
      format: 'mp3',
      title: data.title,
      downloadUrl: data.downloadUrl,
      filename: data.filename || `${data.title}.mp3`,
    },
  };
}

// --- Facebook: i-proxy sa lumang FBDL4U backend, buo ang response ---
async function handleFacebook(url, quality) {
  const q = FB_QUALITIES.has(quality) ? quality : 'best';
  const { status, data } = await fetchJson(`${FB_BACKEND}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, quality: q }),
  });
  if (!data || data.status !== 'success' || !data.download_url) {
    const msg =
      (data && (data.detail || data.message || data.error)) ||
      'Failed to extract video information.';
    return { status: status >= 400 ? status : 502, body: { error: msg } };
  }
  return {
    status: 200,
    body: {
      platform: 'facebook',
      status: 'success',
      download_url: data.download_url,
      video_info: data.video_info || {},
    },
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'GET o POST lang ang pwede dito.' });
  }

  try {
    const params = readParams(req);
    const rawUrl = params.url || '';
    const url = extractUrlFromText(rawUrl);
    if (!url) {
      return res.status(400).json({ error: 'Maglagay ng valid na video link.' });
    }
    const platform = detectPlatform(url);
    if (!platform) {
      return res.status(400).json({ error: UNSUPPORTED_MSG });
    }

    const format = params.format || 'mp3';
    const quality = params.quality || 'best';

    let result;
    if (platform === 'tiktok') result = await handleTikTok(url);
    else if (platform === 'youtube') result = await handleYouTube(url, format, quality);
    else result = await handleFacebook(url, quality);

    return res.status(result.status).json(result.body);
  } catch (err) {
    // Laging JSON ang error — hindi kailanman HTML stack trace.
    console.error('AllDL /api/download error:', err);
    return res
      .status(500)
      .json({ error: 'Hindi ma-process ang video ngayon. Subukan ulit mamaya.' });
  }
}
