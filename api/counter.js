// JepongDevxyz AllDL — api/counter.js
// Counter PER PLATFORM (ayon sa order ni Jepong):
//   - YT link ang pinaste + nag-download -> YOUTUBE counter ang lalabas
//   - FB link -> FACEBOOK counter ang lalabas
//   - TikTok link -> TIKTOK counter ang lalabas
//   - Reddit link -> REDDIT counter ang lalabas (sariling key
//     "counter:reddit" sa FB backend — hindi ni-reset ang FB count)
//   - X link -> X counter ang lalabas (sariling key "counter:x"
//     sa FB backend)
// Kaya GET/POST ?platform=youtube|facebook|tiktok|reddit|x -> ang `count` na
// ibabalik ay yung counter NG PLATFORM NA YUN (hindi ang pinagsama).
// Walang ?platform -> total ng lima (default view bago mag-paste).
// Pinagkukunan pa rin ang tatlong original na counter:
//   Facebook -> GET/POST {FB}/api/counter          -> { count }
//   YouTube  -> GET/POST {YT}/api/counter          -> { count }
//   TikTok   -> GET {TT}/api/stats                 -> { total }
//              (walang POST counter ang TT — tumataas na siya mismo
//               tuwing may successful /api/resolve, kaya GET lang dito)
//   Reddit   -> GET/POST {FB}/api/counter?platform=reddit -> { count }
//   X        -> GET/POST {FB}/api/counter?platform=x      -> { count }
// GET  -> { count, platform?, total, breakdown: { facebook, youtube, tiktok, reddit, x } }
// POST ?platform=facebook|youtube|tiktok|reddit|x (o JSON { platform })
//     -> i-increment ang counter ng platform na yun (FB/YT/Reddit lang;
//        TT: balik lang ang kasalukuyang total niya, kasi naka-increment
//        na siya sa mismong resolve), tapos balik ang counter NG
//        PLATFORM NA YUN bilang `count` (+ `total` ng lahat).
// Hindi kailanman nag-crash kahit down ang isang upstream counter —
// 0 ang bilang niya.

const FB_BACKEND = 'https://jepong-devxyz-fb-dl4u.vercel.app';
const YT_BACKEND = 'https://jepong-devxyz-yt-4-u.vercel.app';
const TT_BACKEND = 'https://jepong-devxyz-pkg-udltikvidz.vercel.app';

const INCREMENT_ENDPOINTS = {
  facebook: `${FB_BACKEND}/api/counter`,
  youtube: `${YT_BACKEND}/api/counter`,
  reddit: `${FB_BACKEND}/api/counter?platform=reddit`,
  x: `${FB_BACKEND}/api/counter?platform=x`,
  // tiktok: walang POST counter — sadyang wala dito.
};

async function fetchCount(url, pick) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return 0;
    const data = await res.json();
    const n = Number(pick(data));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0; // Down ang upstream? 0 lang — tuloy pa rin ang app.
  }
}

async function getBreakdown() {
  const [facebook, youtube, tiktok, reddit, x] = await Promise.all([
    fetchCount(`${FB_BACKEND}/api/counter`, (d) => d.count),
    fetchCount(`${YT_BACKEND}/api/counter`, (d) => d.count),
    fetchCount(`${TT_BACKEND}/api/stats`, (d) => d.total),
    fetchCount(`${FB_BACKEND}/api/counter?platform=reddit`, (d) => d.count),
    fetchCount(`${FB_BACKEND}/api/counter?platform=x`, (d) => d.count),
  ]);
  return { facebook, youtube, tiktok, reddit, x };
}

const PLATFORMS = ['facebook', 'youtube', 'tiktok', 'reddit', 'x'];

function totalOf(b) {
  return b.facebook + b.youtube + b.tiktok + (b.reddit || 0) + (b.x || 0);
}

// Ang ibabalik na `count` ay laging yung counter ng platform na hiningi
// (o ang total kapag walang platform) — yan ang flow ni Jepong.
function counterResponse(breakdown, platform) {
  const total = totalOf(breakdown);
  if (platform && PLATFORMS.includes(platform)) {
    return { count: breakdown[platform], platform, total, breakdown };
  }
  return { count: total, total, breakdown };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      let platform = (req.query && req.query.platform) || '';
      if (!platform && req.body) {
        const body =
          typeof req.body === 'string'
            ? (() => {
                try {
                  return JSON.parse(req.body);
                } catch {
                  return {};
                }
              })()
            : req.body;
        platform = body.platform || '';
      }
      platform = String(platform).toLowerCase();

      if (platform && INCREMENT_ENDPOINTS[platform]) {
        // I-increment ang original counter ng platform na yun.
        // Kahit mag-fail ito, tuloy pa rin — kukunin pa rin ang total.
        try {
          await fetch(INCREMENT_ENDPOINTS[platform], {
            method: 'POST',
            signal: AbortSignal.timeout(8000),
          });
        } catch {
          // ok lang — babasahin pa rin ang pinagsamang total sa baba
        }
      }
      // Para sa TikTok (o walang platform): balik lang ang kasalukuyang
      // counter ng platform na yun — sa TikTok, naka-increment na siya
      // sa mismong /api/resolve pa lang.
      const breakdown = await getBreakdown();
      return res.status(200).json(counterResponse(breakdown, platform || null));
    }

    if (req.method === 'GET') {
      const platform = String((req.query && req.query.platform) || '').toLowerCase();
      const breakdown = await getBreakdown();
      return res.status(200).json(counterResponse(breakdown, PLATFORMS.includes(platform) ? platform : null));
    }

    return res.status(405).json({ error: 'GET o POST lang ang pwede dito.' });
  } catch (err) {
    console.error('AllDL /api/counter error:', err);
    return res.status(200).json({
      count: 0,
      total: 0,
      breakdown: { facebook: 0, youtube: 0, tiktok: 0, reddit: 0, x: 0 },
    });
  }
}
