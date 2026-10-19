// Server statico minimo per provare il sito in locale: node scripts/serve.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const percorso = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(radice, percorso.endsWith('/') ? `${percorso}index.html` : percorso);
  if (!file.startsWith(radice + path.sep)) { res.writeHead(403).end('Vietato'); return; }
  fs.readFile(file, (err, dati) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Non trovato'); return; }
    res.writeHead(200, { 'Content-Type': TIPI[path.extname(file)] ?? 'application/octet-stream' }).end(dati);
  });
}).listen(8080, () => console.log('Sito su http://localhost:8080/'));
