import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json', '.json':'application/json' };
const server = http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep)) {res.writeHead(403).end(); return;}
    const body = await readFile(file);
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache'}).end(body);
  } catch {res.writeHead(404).end('Not found');}
});
server.listen(Number(process.env.PORT || 5173),'0.0.0.0',()=>console.log('Everfrost ready: http://localhost:5173'));
