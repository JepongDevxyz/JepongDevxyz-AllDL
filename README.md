# JepongDevxyz AllDL

Isang downloader para sa **YouTube, TikTok at Facebook** — isang paste box lang.
I-paste mo kahit anong link sa tatlong platform, auto-detect kung saan galing,
tapos lalabas ang download options.

Pinagsama-sama ang tatlong original na app ni Jepong — walang feature na tinanggal:

| App | Original na site | Ano siya |
| --- | --- | --- |
| FBDL4U | `jepong-devxyz-fb-dl4u.vercel.app` | Facebook Reels & Videos downloader (quality picker: Best / 1080p / 720p / 360p / Low / Audio MP3) |
| YT4U | `jepong-devxyz-yt-4-u.vercel.app` | YouTube to MP3 |
| UDLTIKVIDZ | `jepong-devxyz-pkg-udltikvidz.vercel.app` | TikTok no-watermark downloader (No Watermark / HD / With Watermark / Audio, pati photo slideshow) |

## Paano gumagana

Isang Vercel project lang ito — standard layout, walang `vercel.json` rewrites.
Umaasa sa Vercel defaults: `public/` ang static files, `api/` ang serverless functions.

```
public/index.html        — isang page lang, mobile-first, dark/light mode
api/download.js          — detect ng platform + route sa tamang backend
api/proxy-download.js    — i-stream ang file bilang attachment (Facebook download)
api/counter.js           — pinagsamang counter ng tatlong original na app
```

### `api/download.js`

Detect ng platform server-side (hindi pinagkakatiwalaan ang label galing sa client),
tapos:

- **TikTok** — `tikwm.com/api/?url=...&hd=1` (walang key, tulad ng original).
  Relative paths ginagawang absolute, `play` = best stream.
- **YouTube** — kung may `RAPIDAPI_KEY`, diretso sa RapidAPI `youtube-mp36`
  (tulad ng original na YT4U). Kung wala, naka-fallback sa lumang YT4U backend
  (`jepong-devxyz-yt-4-u.vercel.app/api/download`) — gumagana pa rin ang MP3
  kahit walang key.
- **Facebook** — naka-proxy sa lumang FBDL4U backend
  (`jepong-devxyz-fb-dl4u.vercel.app/api/download`, FastAPI + yt-dlp sa Render).
  Quality (`best` / `1080p` / `720p` / `360p` / `worst` / `mp3`) ipinapasa ng buo.

Laging JSON ang sagot — pati ang errors. Hindi suportadong link:

```json
{ "error": "Hindi suportado ang link na yan. YouTube, TikTok o Facebook link lang." }
```

### `api/counter.js` — counter PER PLATFORM (flow ni Jepong)

`GET /api/counter` → `{ count, total, breakdown: { facebook, youtube, tiktok } }` —
total ng tatlo (default view bago mag-paste).

`GET /api/counter?platform=youtube|facebook|tiktok` → ang `count` ay yung
counter NG PLATFORM NA YUN lang. Sa frontend: YT link ang pinaste → YouTube
Downloads ang lalabas; FB link → Facebook Downloads; TikTok link → TikTok
Downloads. Walang link / reset → balik sa Total Downloads.

`POST /api/counter?platform=facebook|youtube|tiktok` — i-increment ang counter
ng platform na yun (FB/YT lang; walang POST counter ang TikTok, tumataas na siya
mismo tuwing may successful resolve), tapos balik ang counter ng platform na
yun bilang `count` (+ `total` ng lahat).

### Frontend

- Isang paste box + Generate button. Auto-detect badge habang nagta-type.
- Tinatanggap kahit may extra text sa paligid ng link (kinukuha ang unang URL).
- Dark/light mode gamit lang ang CSS variables (`var(--card)`, `var(--ink)`, …) —
  walang hardcoded na kulay, walang native dialog (toast lang).
- YouTube: thumbnail + title + Download MP3 **o MP4** (format picker; MP4 may
  quality picker Best/1080p/720p/360p, dumadaan sa `/api/proxy-download`).
  MP3: RapidAPI kung may `RAPIDAPI_KEY`, else lumang YT4U backend. MP4: yt-dlp
  sa FB backend — kailangan ng patch sa FB backend, tingnan ang
  `fb-backend-mp4-patch.md` (hindi pa na-push; kailangan ng go-signal).
- TikTok: dini-detect kung **video, photo slideshow, o music** ang laman
  (`classifyTikTok` sa `api/download.js`, 28/28 tests). Video: player +
  No Watermark / HD / With Watermark. Photo: gallery ng LAHAT ng photos
  (tap para palakihin) + Download All Photos + slideshow video kung meron.
  Music: audio player + track title/author/cover + Download Audio (lumalabas
  din sa video/photo posts na may sound). Music-page links (`/music/...`)
  hindi kayang i-resolve ng tikwm — malinaw na gabay ang error imbes na
  generic failure.
- TikTok: author avatar/nickname/@handle, caption, plays/likes/shares, video
  preview, No Watermark / HD / With Watermark / Audio. Kapag photo slideshow,
  unang photo + paalala.
- Facebook: thumbnail, title, duration, uploader, views, quality radio picker,
  Download button (dumadaan sa `/api/proxy-download`).
- Legal pages (sariling static pages, same design + theme): `/disclaimer.html`,
  `/terms.html`, `/privacy.html` — naka-link sa footer ng lahat ng pages.
  Disclaimer: hindi affiliated sa YouTube/TikTok/Facebook, personal use lang,
  user ang responsable sa rights. Terms: acceptable use, "as is", PH law.
  Privacy: walang account/login, hindi ini-store ang pasted links, anonymous
  counter lang (numbers), theme lang ang nasa localStorage, walang tracking.

## Deploy sa Vercel

1. I-push ang repo na ito sa GitHub (hal. `JepongDevxyz/JepongDevxyz-AllDL`).
2. Sa Vercel: **Add New → Project → Import** ang repo. Walang build step,
   walang kailangang baguhin — defaults lang.
3. Optional env var: `RAPIDAPI_KEY` — YouTube MP3 key para sa RapidAPI
   `youtube-mp36`. **Hindi ito required**: kapag wala ito, gumagana pa rin ang
   YouTube sa pamamagitan ng lumang YT4U backend. Walang ibang secret na kailangan.
4. I-deploy. Tapos i-test: mag-paste ng isang YouTube link, isang TikTok link,
   at isang Facebook reel link.

## Test (local, walang deploy)

```bash
npm test   # node tests/detect.test.mjs — platform detect + YouTube ID + URL extract
node --check api/download.js
node --check api/proxy-download.js
node --check api/counter.js
```

## Mga paalala

- Ang tatlong original na site ay nananatiling buhay at sila pa rin ang
  backend ng app na ito (FB at YT bilang fallback/proxy, TikTok bilang
  tikwm). Kapag na-down ang isa sa kanila, yung platform na yun lang ang
  apektado — hindi ang buong app.
- Bago mag-deploy, siguraduhing naka-set ang `RAPIDAPI_KEY` kung gusto mong
  dumiretso sa RapidAPI ang YouTube (mas mabilis, hindi umaasa sa lumang backend).
