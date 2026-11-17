# FB backend patch — para gumana ang YouTube MP4 sa AllDL

## Bakit kailangan ito

Ang AllDL ay humihingi ng YouTube MP4 sa FBDL4U backend
(`POST https://jepong-devxyz-fb-dl4u.vercel.app/api/download`, na
naka-rewrite sa Render FastAPI service). Pero ang backend ngayon ay
hindi makapagbalik ng MP4 link para sa YouTube — live-proven
2026-11-17:

- `quality: "best"` → HTTP 400 `Requested format is not available`
- `quality: "720p"` → HTTP 200 pero `download_url: null`

Dahilan: ang format strings niya (`best`, `bestvideo[height<=720]+bestaudio/...`)
ay DASH/merged formats sa YouTube — walang iisang file URL, kaya
`info.get('url')` ay `None`. Sa Facebook gumagana ang mga yan kasi
iisang mp4 file ang binabalik ng Facebook extractor.

## Ang fix (repo: `JepongDevxyz/JepongDevxyz-Facebook`, file: `main.py`)

Sa `download_video()`, bago ang `try:`, palitan ang format selection
ng ganito — kapag YouTube ang URL, single-file MP4 format ang pipiliin;
kapag hindi YouTube, walang nagbabago (FB behavior, 100% pareho):

```python
@app.post("/api/download")
def download_video(req: DownloadRequest):
    is_youtube = "youtube.com" in req.url or "youtu.be" in req.url
    ydl_opts = {'format': 'best'}
    if is_youtube:
        # YouTube: single-file MP4 lang — ang merged DASH formats ay
        # walang iisang download URL (download_url: null).
        if req.quality == '1080p':
            ydl_opts['format'] = 'best[height<=1080][ext=mp4]/best[height<=1080][ext=mp4]/best'
        elif req.quality == '720p':
            ydl_opts['format'] = 'best[height<=720][ext=mp4]/best[height<=720][ext=mp4]/best'
        elif req.quality == '360p':
            ydl_opts['format'] = 'best[height<=360][ext=mp4]/best[height<=360][ext=mp4]/best'
        elif req.quality == 'worst':
            ydl_opts['format'] = 'worst[ext=mp4]/worst'
        elif req.quality == 'mp3':
            ydl_opts['format'] = 'bestaudio/best'
        else:  # best
            ydl_opts['format'] = 'best[ext=mp4]/best[ext=mp4]/best'
    elif req.quality == '1080p':
        ydl_opts['format'] = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
    elif req.quality == '720p':
        ydl_opts['format'] = 'bestvideo[height<=720]+bestaudio/best[height<=720]'
    elif req.quality == '360p':
        ydl_opts['format'] = 'bestvideo[height<=360]+bestaudio/best[height<=360]'
    elif req.quality == 'worst':
        ydl_opts['format'] = 'worst'
    elif req.quality == 'mp3':
        ydl_opts['format'] = 'bestaudio/best'
    # ...tuloy ang dating try/except block, walang binabago...
```

## Deploy

1. I-push ang pagbabago sa `JepongDevxyz/JepongDevxyz-Facebook` (main).
   Render auto-deploys ang service mula sa repo (tingnan ang `render.yaml`).
2. Hintayin ang Render deploy na maging Live.
3. I-verify:
   `POST /api/download {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "quality": "best"}`
   → dapat `status: "success"` at `download_url` ay isang googlevideo mp4 link (hindi null).
4. Pagkatapos, i-test ang AllDL MP4 end-to-end (YouTube link → MP4 → Download).

## Status

- **HINDI PA NA-PUSH.** Inihanda lang ang patch na ito. Kailangan ng
  go-signal ni Jepong bago i-push, kasi live service ang FBDL4U.
- Ang AllDL MP4 code (`api/download.js` → FB backend, `format: "mp4"`)
  ay handa na; hinihintay lang ang patch na ito para maglabas ng link.
  Hangga't hindi pa live ang patch, magpapakita ang AllDL ng maayos na
  error message kapag MP4 ang pinili, at gumagana pa rin ang MP3.

---

## v2 — android player client (PUSHED 2026-11-17 20:23, commit bbdf2fd)

v1 lang ay HINDI gumana live (400 pa rin). Root cause, na-prove ng local
yt-dlp test: ang default web client ng YouTube ay DASH-only na (walang
combined format). Ang android player client ang nakakakita ng format 18
(mp4 640x360, may audio). Dinagdag sa YouTube branch:
`ydl_opts['extractor_args'] = {'youtube': {'player_client': ['android']}}`.
Live-proven: YT best/720p → 200 + googlevideo URL (itag=18), dinownload
ang unang 2048 bytes — tunay na MP4 (`ftypmp42`). Limit: 360p lang ang
combined MP4; 720p/1080p ay DASH at kailangan ng server-side merge.

## v3 — POST /api/formats (available resolutions) — PENDING PUSH

Order ni Jepong 2026-11-17 ~20:27: "Ayusin mo dapat available kung anong
available na resolution." Bagong endpoint sa `main.py` (pagkatapos ng
`download_video`): nag-extract ng info (skip_download), tapos binabalik
ang TUNAY na available na resolutions — hindi cap:
- YouTube: combined mp4 lang (may video AT audio) → hal. `["best","360p"]`
- Facebook: kahit anong video format (merged ang download) → hal. portrait
  reel `["best"]` lang; landscape 1080p video `["best","1080p","720p","360p"]`
- Isang cap (1080p/720p/360p) ay available lang kung yung pinakamataas na
  format na pasok sa cap ay EXACTLY yung cap na yun.
Response: `{status, platform, title, available, best_height, video_info}`.
AllDL side: `api/formats.js` (proxy) + dynamic picker sa `public/index.html`
— pag nag-paste, yun lang ang options na lalabas; pag hindi ma-check,
mananatili ang static na options (fallback, walang mawawala).
