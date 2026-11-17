// Detect test para sa AllDL — walang network, pure function test lang.
// Tumakbo gamit:  npm test   o   node tests/detect.test.mjs
import {
  detectPlatform,
  extractYouTubeID,
  extractUrlFromText,
  classifyTikTok,
  isTikTokMusicPage,
} from '../api/download.js';

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ->  got: ${JSON.stringify(actual)}  expected: ${JSON.stringify(expected)}`);
}

// --- Platform detect: YouTube ---
check('youtube watch', detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');
check('youtu.be short', detectPlatform('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
check('youtube shorts', detectPlatform('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'youtube');
check('music.youtube.com', detectPlatform('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');

// --- Platform detect: TikTok ---
check('tiktok video', detectPlatform('https://www.tiktok.com/@tiktok/video/7223723522508225798'), 'tiktok');
check('vt.tiktok.com short', detectPlatform('https://vt.tiktok.com/ZSabc1234/'), 'tiktok');
check('vm.tiktok.com short', detectPlatform('https://vm.tiktok.com/ZSabc1234/'), 'tiktok');

// --- Platform detect: Facebook ---
check('facebook reel', detectPlatform('https://www.facebook.com/reel/1234567890123456'), 'facebook');
check('facebook watch', detectPlatform('https://www.facebook.com/watch?v=1234567890123456'), 'facebook');
check('fb.watch short', detectPlatform('https://fb.watch/abc123XYZ/'), 'facebook');

// --- Unsupported: dapat null (mare-reject ng server ng 400) ---
check('instagram (unsupported)', detectPlatform('https://www.instagram.com/reel/AbC123xyz/'), null);
check('x.com (unsupported)', detectPlatform('https://x.com/someuser/status/1234567890123456789'), null);
check('random site (unsupported)', detectPlatform('https://example.com/video/123'), null);
check('empty string', detectPlatform(''), null);

// --- TikTok: photo / video / music links ---
check('tiktok photo link', detectPlatform('https://www.tiktok.com/@mrmarvelslideshow/photo/7701496054092467488'), 'tiktok');
check('tiktok music page link', detectPlatform('https://www.tiktok.com/music/In-the-House-In-a-Heartbeat-6757066848384059393'), 'tiktok');
check('tiktok music page detected', isTikTokMusicPage('https://www.tiktok.com/music/In-the-House-In-a-Heartbeat-6757066848384059393'), true);
check('tiktok video is NOT music page', isTikTokMusicPage('https://www.tiktok.com/@tiktok/video/7223723522508225798'), false);

// --- TikTok content classify: video / photo / music ---
function checkClassify(name, item, expected) {
  const got = classifyTikTok(item);
  const ok = got.contentType === expected.contentType &&
    got.hasVideo === expected.hasVideo &&
    got.hasPhotos === expected.hasPhotos &&
    got.hasMusic === expected.hasMusic;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ->  got: ${JSON.stringify(got)}  expected: ${JSON.stringify(expected)}`);
}
checkClassify('classify: video + music', { play: 'https://x/v.mp4', hdplay: 'https://x/hd.mp4', music_info: { play: 'https://x/m.mp3', title: 'Song' } },
  { contentType: 'video', hasVideo: true, hasPhotos: false, hasMusic: true });
checkClassify('classify: photo slideshow + music', { images: ['https://x/1.jpg', 'https://x/2.jpg'], play: 'https://x/slideshow.mp4', music_info: { play: 'https://x/m.mp3', title: 'Song' } },
  { contentType: 'photo', hasVideo: true, hasPhotos: true, hasMusic: true });
checkClassify('classify: photo only, no music', { images: ['https://x/1.jpg'] },
  { contentType: 'photo', hasVideo: false, hasPhotos: true, hasMusic: false });
checkClassify('classify: music only', { music_info: { play: 'https://x/m.mp3', title: 'Song' } },
  { contentType: 'music', hasVideo: false, hasPhotos: false, hasMusic: true });
checkClassify('classify: empty item', {},
  { contentType: 'unknown', hasVideo: false, hasPhotos: false, hasMusic: false });
check('extract YT id (watch)', extractYouTubeID('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
check('extract YT id (youtu.be)', extractYouTubeID('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
check('extract YT id (short id = invalid)', extractYouTubeID('https://www.youtube.com/watch?v=abc'), null);

// --- URL extract: may extra text sa paligid ---
check(
  'extract URL with surrounding text',
  extractUrlFromText('panoorin mo to https://youtu.be/dQw4w9WgXcQ ang ganda!'),
  'https://youtu.be/dQw4w9WgXcQ',
);
check('extract URL (no URL)', extractUrlFromText('walang link dito'), '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
