import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { leggiXlsx } from '../../src/tennis/xlsx.js';
import { CONFIG } from '../../src/config.js';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// Piccolo scrittore zip: metodo 0 (stored) o 8 (deflate) per ogni file.
function zip(files) {
  const locali = [];
  const centrali = [];
  let offset = 0;
  for (const { nome, dati, metodo, descrittore } of files) {
    const raw = Buffer.from(dati);
    const comp = metodo === 8 ? zlib.deflateRawSync(raw) : raw;
    const nomeB = Buffer.from(nome);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0);
    loc.writeUInt16LE(20, 4);
    loc.writeUInt16LE(metodo, 8);
    if (!descrittore) {
      loc.writeUInt32LE(crc32(raw), 14);
      loc.writeUInt32LE(comp.length, 18);
      loc.writeUInt32LE(raw.length, 22);
    } else loc.writeUInt16LE(8, 6);
    loc.writeUInt16LE(nomeB.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(metodo, 10);
    cen.writeUInt32LE(crc32(raw), 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nomeB.length, 28);
    cen.writeUInt32LE(offset, 42);
    locali.push(loc, nomeB, comp);
    centrali.push(cen, nomeB);
    offset += 30 + nomeB.length + comp.length;
  }
  const dir = Buffer.concat(centrali);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locali, dir, eocd]);
}

const FOGLIO = `<?xml version="1.0"?><worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="E1" t="s"><v>3</v></c></row>
<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>46023</v></c><c r="C2"><v>1.85</v></c><c r="E2" t="inlineStr"><is><t>Nota &amp; &#65;&#x42;</t></is></c></row>
<row r="3"><c r="A3" t="s"><v>5</v></c><c r="B3"><v>46024</v></c><c r="E3"><v>7</v></c></row>
</sheetData></worksheet>`;
const STRINGHE = `<sst><si><t>Winner</t></si><si><t>Date</t></si><si><t>Quota</t></si><si><t>Extra</t></si><si><t>Sinner J.</t></si><si><r><t>De </t></r><r><rPr/><t>Minaur A.</t></r></si></sst>`;

const attese = [
  { Winner: 'Sinner J.', Date: '2026-01-01', Quota: 1.85, Extra: 'Nota & AB' },
  { Winner: 'De Minaur A.', Date: '2026-01-02', Extra: 7 },
];

test('xlsx stored e deflate: intestazione, stringhe condivise, numeri, date', () => {
  for (const metodo of [0, 8]) {
    const buf = zip([
      { nome: 'xl/worksheets/sheet1.xml', dati: FOGLIO, metodo },
      { nome: 'xl/sharedStrings.xml', dati: STRINGHE, metodo },
    ]);
    assert.deepEqual(leggiXlsx(buf), attese, `metodo ${metodo}`);
  }
});

test('xlsx: primo foglio dalla workbook, anche senza sharedStrings', () => {
  const wb = '<workbook><sheets><sheet name="A" sheetId="1" r:id="rId7"/></sheets></workbook>';
  const rels = '<Relationships><Relationship Id="rId7" Type="x" Target="worksheets/dati.xml"/></Relationships>';
  const foglio = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Date</t></is></c><c r="B1" t="inlineStr"><is><t>N</t></is></c></row><row r="2"><c r="A2"><v>45658</v></c><c r="B2"><v>3</v></c></row></sheetData></worksheet>';
  const buf = zip([
    { nome: 'xl/workbook.xml', dati: wb, metodo: 8 },
    { nome: 'xl/_rels/workbook.xml.rels', dati: rels, metodo: 0 },
    { nome: 'xl/worksheets/dati.xml', dati: foglio, metodo: 8 },
  ]);
  assert.deepEqual(leggiXlsx(buf), [{ Date: '2025-01-01', N: 3 }]);
});

test('xlsx: tipi str/b/e/d, cella vuota, <t .../> con attributi, data descriptor', () => {
  const foglio = '<worksheet><sheetData>'
    + '<row r="1"><c r="A1" t="inlineStr"><is><t>S</t></is></c><c r="B1" t="inlineStr"><is><t>B</t></is></c><c r="C1" t="inlineStr"><is><t>E</t></is></c><c r="D1" t="inlineStr"><is><t>Data</t></is></c><c r="E1" t="inlineStr"><is><t>V</t></is></c><c r="F1" t="inlineStr"><is><t>T</t></is></c></row>'
    + '<row r="2"><c r="A2" t="str"><f>x</f><v>ciao</v></c><c r="B2" t="b"><v>1</v></c><c r="C2" t="e"><v>#N/A</v></c><c r="D2" t="d"><v>2026-03-05T00:00:00</v></c><c r="E2"/><c r="F2" t="inlineStr"><is><t xml:space="preserve"> a </t><t x="1"/><t>b</t></is></c></row>'
    + '<row r="3"><c r="A3" t="b"><v>0</v></c><c r="B3"/></row>'
    + '</sheetData></worksheet>';
  const attese2 = [
    { S: 'ciao', B: true, Data: '2026-03-05', T: ' a b' },
    { S: false },
  ];
  assert.deepEqual(leggiXlsx(zip([{ nome: 'xl/worksheets/sheet1.xml', dati: foglio, metodo: 8, descrittore: true }])), attese2);
  assert.deepEqual(leggiXlsx(zip([{ nome: 'xl/worksheets/sheet1.xml', dati: foglio, metodo: 0 }])), attese2);
});

test('xlsx non valido → errore chiaro', () => {
  assert.throws(() => leggiXlsx(Buffer.from('ciao')), /xlsx non valido/);
  assert.throws(() => leggiXlsx(zip([{ nome: 'a.txt', dati: 'x', metodo: 0 }])), /xlsx non valido/);
});

test('CONFIG.tennis congelato', () => {
  assert.deepEqual(CONFIG.tennis, {
    eloIniziale: 1500, kBase: 250, kOffset: 5, kEsponente: 0.4,
    pesoSuperficie: 0.5, pesoModello: 0.5, pesoModelloPocheDati: 0.25,
    minPartite12Mesi: 20, minBookmaker: 3, creditiPerTorneo: 1, riservaSeraPerTorneo: 1,
  });
  assert.ok(Object.isFrozen(CONFIG.tennis));
});
