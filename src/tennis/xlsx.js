// Lettore xlsx minimo, senza pacchetti: zip (stored/deflate) + XML essenziale.
import zlib from 'node:zlib';

const errore = (motivo) => new Error(`xlsx non valido: ${motivo}`);

function leggiZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw errore('file troppo corto');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw errore('directory centrale non trovata');
  const totale = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const file = new Map();
  for (let n = 0; n < totale; n++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) throw errore('directory centrale danneggiata');
    const metodo = buf.readUInt16LE(pos + 10);
    const compressa = buf.readUInt32LE(pos + 20);
    const lunghNome = buf.readUInt16LE(pos + 28);
    const lunghExtra = buf.readUInt16LE(pos + 30);
    const lunghCommento = buf.readUInt16LE(pos + 32);
    const offsetLocale = buf.readUInt32LE(pos + 42);
    const nome = buf.toString('utf8', pos + 46, pos + 46 + lunghNome);
    file.set(nome, { metodo, compressa, offsetLocale });
    pos += 46 + lunghNome + lunghExtra + lunghCommento;
  }
  return (nome) => {
    const f = file.get(nome);
    if (!f) return null;
    const o = f.offsetLocale;
    if (o + 30 > buf.length || buf.readUInt32LE(o) !== 0x04034b50) throw errore(`intestazione locale di ${nome} danneggiata`);
    const inizio = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28);
    const dati = buf.subarray(inizio, inizio + f.compressa);
    if (f.metodo === 0) return dati.toString('utf8');
    if (f.metodo === 8) {
      try { return zlib.inflateRawSync(dati).toString('utf8'); } catch { throw errore(`${nome} non decomprimibile`); }
    }
    throw errore(`metodo di compressione ${f.metodo} non supportato`);
  };
}

function decodifica(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e];
  });
}

// Testo di un frammento (<si> o <is>): concatena tutti i <t> (anche le sequenze di testo formattato).
const testo = (frammento) => [...frammento.matchAll(/<t(?:\s[^>]*)?\/>|<t(?:\s[^>]*[^\/>])?>([\s\S]*?)<\/t>/g)]
  .map((m) => decodifica(m[1] ?? '')).join('');

function stringheCondivise(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g)].map((m) => testo(m[1] ?? ''));
}

function colonna(rif) {
  let n = 0;
  for (const c of rif.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? '') n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function attributo(tag, nome) {
  const m = tag.match(new RegExp(String.raw`(?:^|\s)${nome}\s*=\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? decodifica(m[1] ?? m[2]) : null;
}

function percorsoPrimoFoglio(leggi) {
  const wb = leggi('xl/workbook.xml');
  const rels = leggi('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const foglio = wb.match(/<sheet\s[^>]*>/);
    const rid = foglio && (attributo(foglio[0], 'r:id') ?? attributo(foglio[0], 'id'));
    if (rid) {
      for (const r of rels.matchAll(/<Relationship\s[^>]*>/g)) {
        if (attributo(r[0], 'Id') === rid) {
          const t = attributo(r[0], 'Target') ?? '';
          return t.startsWith('/') ? t.slice(1) : `xl/${t}`;
        }
      }
    }
  }
  return 'xl/worksheets/sheet1.xml';
}

const seriale = (n) => new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);

export function leggiXlsx(buffer) {
  const leggi = leggiZip(buffer);
  const percorso = percorsoPrimoFoglio(leggi);
  const xml = leggi(percorso);
  if (xml === null) throw errore(`foglio ${percorso} mancante`);
  const stringhe = stringheCondivise(leggi('xl/sharedStrings.xml'));

  const righe = [];
  for (const r of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const celle = new Map();
    for (const c of r[1].matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = c[1] ?? '';
      const rif = attributo(tag, 'r');
      if (!rif) continue;
      const tipo = attributo(tag, 't');
      const corpo = c[2] ?? '';
      let valore;
      if (tipo === 'inlineStr') {
        valore = testo(corpo);
      } else {
        const v = corpo.match(/<v>([\s\S]*?)<\/v>/);
        if (!v) continue;
        const grezzo = decodifica(v[1]);
        if (tipo === 's') valore = stringhe[Number(grezzo)];
        else if (tipo === 'str') valore = grezzo;
        else if (tipo === 'd') valore = grezzo.slice(0, 10);
        else if (tipo === 'b') valore = grezzo === '1';
        else if (tipo === 'e') continue;
        else valore = Number(grezzo);
      }
      if (valore === undefined || valore === '' || (typeof valore === 'number' && Number.isNaN(valore))) continue;
      celle.set(colonna(rif), valore);
    }
    if (celle.size) righe.push(celle);
  }
  if (!righe.length) throw errore('foglio vuoto');

  const intestazione = new Map();
  for (const [i, v] of righe[0]) intestazione.set(i, String(v));
  return righe.slice(1).map((celle) => {
    const o = {};
    for (const [i, nome] of intestazione) {
      if (!celle.has(i)) continue;
      const v = celle.get(i);
      o[nome] = typeof v === 'number' && nome.includes('Date') ? seriale(v) : v;
    }
    return o;
  });
}
