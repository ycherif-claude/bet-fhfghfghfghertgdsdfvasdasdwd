// Icona dell'app (schermata Home dell'iPhone e Android): un biglietto di carta sul panno verde, come il sito.
// Senza librerie: si disegna pixel per pixel e si scrive il PNG con zlib.
// Uso: node scripts/icona.mjs → site/icona-180.png, site/icona-192.png, site/icona-512.png
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const FELTRO = [0x16, 0x30, 0x2a];
const CARTA = [0xf6, 0xf8, 0xf4];
const SEGNAPUNTI = [0xf2, 0xc9, 0x4c];
const BORDO = [0xc9, 0xd2, 0xcb];
const INCHIOSTRO = [0x14, 0x20, 0x1b];

const TABELLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABELLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const pezzo = (tipo, dati) => {
  const lunghezza = Buffer.alloc(4);
  lunghezza.writeUInt32BE(dati.length);
  const td = Buffer.concat([Buffer.from(tipo), dati]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([lunghezza, td, crc]);
};

function png(lato, colore) {
  const righe = Buffer.alloc(lato * (lato * 3 + 1));
  for (let y = 0; y < lato; y++) {
    righe[y * (lato * 3 + 1)] = 0;
    for (let x = 0; x < lato; x++) righe.set(colore(x / lato, y / lato), y * (lato * 3 + 1) + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lato, 0);
  ihdr.writeUInt32BE(lato, 4);
  ihdr[8] = 8; // bit per canale
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pezzo('IHDR', ihdr), pezzo('IDAT', zlib.deflateSync(righe, { level: 9 })), pezzo('IEND', Buffer.alloc(0)),
  ]);
}

// Coordinate da 0 a 1. Biglietto con angoli arrotondati, fascia gialla in alto, due righe di "partite",
// tratteggio con le due tacche e il piede.
function colore(x, y) {
  const [l, r, t, b, raggio] = [0.2, 0.8, 0.16, 0.84, 0.05];
  const dentro = x >= l && x <= r && y >= t && y <= b;
  if (!dentro) return FELTRO;
  const cx = Math.min(Math.max(x, l + raggio), r - raggio);
  const cy = Math.min(Math.max(y, t + raggio), b - raggio);
  if ((x - cx) ** 2 + (y - cy) ** 2 > raggio ** 2) return FELTRO;
  const taglio = 0.66;
  // Tacche ai lati della riga tratteggiata.
  if (Math.min((x - l) ** 2, (x - r) ** 2) + (y - taglio) ** 2 < 0.045 ** 2) return FELTRO;
  if (y < t + 0.13) return SEGNAPUNTI;
  if (Math.abs(y - taglio) < 0.008 && Math.floor((x - l) / 0.045) % 2 === 0) return BORDO;
  // Righe delle partite: una barra lunga (la partita) e una corta a destra (la quota).
  for (const ry of [0.4, 0.52]) {
    if (Math.abs(y - ry) < 0.025) {
      if (x > l + 0.06 && x < l + 0.36) return INCHIOSTRO;
      if (x > r - 0.16 && x < r - 0.06) return INCHIOSTRO;
    }
  }
  if (Math.abs(y - 0.75) < 0.022 && x > l + 0.06 && x < l + 0.26) return BORDO;
  return CARTA;
}

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
for (const lato of [180, 192, 512]) {
  fs.writeFileSync(path.join(dir, `icona-${lato}.png`), png(lato, colore));
  console.log(`site/icona-${lato}.png`);
}
