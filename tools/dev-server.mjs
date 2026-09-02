/* ============================================================================
   tools/dev-server.mjs — sert public/ et branche api/sync.js avec la meme
   signature que Vercel, pour pouvoir tester la synchronisation en local.

       node tools/dev-server.mjs          (port 5300)
       PORT=8080 node tools/dev-server.mjs

   Pour du statique pur, `npx serve public` suffit : ce serveur n'existe que
   parce que la fonction serverless doit repondre.
   ========================================================================== */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/sync.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/sync') {
    req.query = Object.fromEntries(url.searchParams);
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
    res.send = (s) => { res.end(s); return res; };
    try { await handler(req, res); } catch (e) { res.statusCode = 500; res.end(String(e)); }
    return;
  }
  let p = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!p.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  try {
    const st = await stat(p);
    if (st.isDirectory()) p = join(p, 'index.html');
  } catch { p = join(ROOT, 'index.html'); }
  try {
    const buf = await readFile(p);
    res.setHeader('Content-Type', MIME[extname(p)] || 'application/octet-stream');
    res.end(buf);
  } catch { res.statusCode = 404; res.end('404'); }
});
server.listen(Number(process.env.PORT || 5300), '127.0.0.1',
  () => console.log('ready', server.address().port));
