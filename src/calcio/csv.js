// Legge un CSV con intestazione; gestisce BOM, CRLF e virgolette doppie.
export function leggiCsv(testo) {
  const righe = [];
  let riga = [];
  let campo = '';
  let tra = false;
  const s = String(testo).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (tra) {
      if (ch === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; } else tra = false;
      } else campo += ch;
    } else if (ch === '"') tra = true;
    else if (ch === ',') { riga.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      riga.push(campo); campo = '';
      righe.push(riga); riga = [];
    } else campo += ch;
  }
  if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
  const utili = righe.filter((r) => r.some((x) => x !== ''));
  if (!utili.length) return [];
  const [intest, ...dati] = utili;
  return dati.map((r) => Object.fromEntries(intest.map((h, i) => [h, r[i] ?? ''])));
}
