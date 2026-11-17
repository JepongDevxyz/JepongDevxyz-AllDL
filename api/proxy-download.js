// JepongDevxyz AllDL — api/proxy-download.js
// I-stream ang upstream file papunta sa user bilang attachment,
// para gumana ang Download button ng Facebook (at kahit anong
// direct file link). Kapareho ng ugali ng original na FB backend:
// Content-Disposition: attachment + upstream content-type.
// GET ?url=<file-url>&filename=<name>
// http(s) lang ang tinatanggap — walang file:// o internal URLs.

import { Readable } from 'node:stream';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET lang ang pwede dito.' });
  }

  try {
    const rawUrl = (req.query && req.query.url) || '';
    let target;
    try {
      target = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Maglagay ng valid na file link.' });
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return res.status(400).json({ error: 'http o https link lang ang pwede.' });
    }

    // Linisin ang filename: walang path, walang quotes na makakasira ng header.
    const rawName = String((req.query && req.query.filename) || 'video.mp4');
    const filename = rawName
      .split(/[\\/]/)
      .pop()
      .replace(/["\r\n]/g, '')
      .trim() || 'video.mp4';

    const upstream = await fetch(target.toString(), {
      signal: AbortSignal.timeout(60000),
    });
    if (!upstream.ok || !upstream.body) {
      return res
        .status(502)
        .json({ error: 'Hindi ma-download ang file ngayon. Subukan ulit mamaya.' });
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'video/mp4',
    );
    const length = upstream.headers.get('content-length');
    if (length) res.setHeader('Content-Length', length);

    // I-stream nang pa-chunk para hindi maubos ang memory sa malalaking video.
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('AllDL /api/proxy-download error:', err);
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ error: 'Hindi ma-download ang file ngayon. Subukan ulit mamaya.' });
    }
    res.end();
  }
}
