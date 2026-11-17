// Formats test para sa AllDL — /api/formats proxy.
// Walang tunay na network: naka-stub ang global fetch para gayahin
// ang FB backend. Tumakbo gamit:  npm test   o   node tests/formats.test.mjs
import handler from '../api/formats.js';

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ->  got: ${JSON.stringify(actual)}  expected: ${JSON.stringify(expected)}`);
}

function mockRes() {
  const res = {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() { return this; },
  };
  return res;
}

function mockReq(url) {
  return { method: 'GET', query: { url } };
}

// Stub ng fetch: gayahin ang FB backend /api/formats.
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  const u = body.url || '';
  const json = async () => {
    if (u.includes('youtube.com') || u.includes('youtu.be')) {
      return { status: 'success', platform: 'youtube', title: 'Rick Astley', available: ['best', '2160p', '1080p', '720p', '360p'], merged_qualities: ['best', '2160p', '1080p', '720p'], best_height: 2160 };
    }
    if (u.includes('facebook.com')) {
      return { status: 'success', platform: 'facebook', title: 'KSI reel', available: ['best'], merged_qualities: [], best_height: 1920 };
    }
    return { detail: 'ERROR: Unsupported URL' };
  };
  const ok = u.includes('youtube.com') || u.includes('youtu.be') || u.includes('facebook.com');
  return { ok, status: ok ? 200 : 400, text: async () => JSON.stringify(await json()) };
};

// --- YouTube: 360p lang ang available ---
{
  const res = mockRes();
  await handler(mockReq('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), res);
  check('YT formats status', res.statusCode, 200);
  check('YT formats available', res.body.available, ['best', '2160p', '1080p', '720p', '360p']);
  check('YT formats merged', res.body.merged_qualities, ['best', '2160p', '1080p', '720p']);
  check('YT formats platform', res.body.platform, 'youtube');
}

// --- Facebook portrait reel: Best lang ---
{
  const res = mockRes();
  await handler(mockReq('https://www.facebook.com/reel/1089809480737050'), res);
  check('FB formats status', res.statusCode, 200);
  check('FB formats available', res.body.available, ['best']);
  check('FB formats merged', res.body.merged_qualities, []);
  check('FB formats platform', res.body.platform, 'facebook');
}

// --- TikTok: walang resolution picker ---
{
  const res = mockRes();
  await handler(mockReq('https://www.tiktok.com/@tiktok/video/7223723522508225798'), res);
  check('TikTok formats status', res.statusCode, 400);
}

// --- Unsupported site: 400 ---
{
  const res = mockRes();
  await handler(mockReq('https://example.com/video/123'), res);
  check('unsupported formats status', res.statusCode, 400);
}

// --- Walang URL: 400 ---
{
  const res = mockRes();
  await handler(mockReq(''), res);
  check('no URL formats status', res.statusCode, 400);
}

// --- FB backend error: ipasa ang error ---
{
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({ detail: 'ERROR: video not found' }),
  });
  const res = mockRes();
  await handler(mockReq('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), res);
  check('backend error status', res.statusCode, 400);
  check('backend error message', res.body.error, 'ERROR: video not found');
  globalThis.fetch = origFetch;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
