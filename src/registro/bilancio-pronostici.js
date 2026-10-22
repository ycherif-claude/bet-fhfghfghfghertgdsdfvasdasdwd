// Bilancio dei pronostici di un periodo per la revisione del lunedì [utente, 22/10/2026, idea 5].
// Legge le istantanee (data/registro/<data>-pronostici.json; se mancano, il file della giornata) e calcola:
// - tutti, migliori e ✅ giocabili: giusti, sbagliati, aperti, percentuale uscita e percentuale promessa
//   (media della probabilità mostrata e del limite prudente dei pronostici chiusi);
// - per partita: tutti giusti / qualcuno sbagliato / aperte (i pronostici della stessa partita sono collegati);
// - doppie e triple: vinte, perse, rimborsate, aperte e rendimento con 1 € a schedina alle quote usate
//   (esito ricalcolato dalle gambe).
// Uso: npm run bilancio-pronostici -- <da> <a>   (date AAAA-MM-GG, estremi compresi; stampa JSON)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { leggiIstantanea } from '../regole/pronostici.js';
import { esitoSchedina } from '../regole/schedine-pronostici.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const leggi = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
};

function date(da, a) {
  const out = [];
  for (let t = Date.parse(`${da}T12:00:00Z`); t <= Date.parse(`${a}T12:00:00Z`); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// { pronostici, giusti, sbagliati, rimborsati, aperti, percentuale, promessa, promessaPrudente }
function conta(righe) {
  const chiuse = righe.filter((r) => r.esito === 'vinta' || r.esito === 'persa');
  const giusti = chiuse.filter((r) => r.esito === 'vinta').length;
  return {
    pronostici: righe.length,
    giusti,
    sbagliati: chiuse.length - giusti,
    rimborsati: righe.filter((r) => r.esito === 'rimborsata').length,
    aperti: righe.filter((r) => r.esito == null).length,
    percentuale: chiuse.length ? giusti / chiuse.length : null,
    promessa: media(chiuse.map((r) => r.prob).filter(num)),
    promessaPrudente: media(chiuse.map((r) => (num(r.limite) ? r.limite : r.prob)).filter(num)),
  };
}

function perPartita(righe) {
  const gruppi = new Map();
  for (const r of righe) gruppi.set(`${r.data}|${r.idPartita}`, [...(gruppi.get(`${r.data}|${r.idPartita}`) ?? []), r]);
  const b = { partite: gruppi.size, tutteGiuste: 0, conSbagliati: 0, aperte: 0 };
  for (const lista of gruppi.values()) {
    if (lista.some((r) => r.esito === 'persa')) b.conSbagliati++;
    else if (lista.some((r) => r.esito == null)) b.aperte++;
    else b.tutteGiuste++;
  }
  return b;
}

// Con 1 € a schedina: vinta → quota finale − 1, persa → −1, rimborsata → 0.
function contaSchedine(schedine) {
  const b = { totale: schedine.length, vinte: 0, perse: 0, rimborsate: 0, aperte: 0, profitto: 0, rendimento: null };
  for (const s of schedine) {
    const e = esitoSchedina(s);
    if (e.esito === 'vinta') { b.vinte++; b.profitto += e.quotaFinale - 1; } else if (e.esito === 'persa') { b.perse++; b.profitto -= 1; } else if (e.esito === 'rimborsata') b.rimborsate++;
    else b.aperte++;
  }
  b.profitto = Math.round(b.profitto * 100) / 100;
  const chiuse = b.vinte + b.perse + b.rimborsate;
  b.rendimento = chiuse ? Math.round((b.profitto / chiuse) * 10000) / 10000 : null;
  return b;
}

export function bilancioPronosticiPeriodo(dirData, da, a) {
  const righe = [];
  const schedine = [];
  const giornate = [];
  for (const data of date(da, a)) {
    const ist = leggiIstantanea(dirData, data);
    const giornata = ist && !ist.daGiornata && !Array.isArray(ist.schedine) ? leggi(path.join(dirData, 'giornate', `${data}.json`)) : null;
    const sch = Array.isArray(ist?.schedine) ? ist.schedine : Array.isArray(giornata?.schedinePronostici) ? giornata.schedinePronostici : [];
    if (!ist?.pronostici?.length && !sch.length) continue;
    giornate.push(data);
    righe.push(...(ist?.pronostici ?? []).filter((r) => r && typeof r === 'object').map((r) => ({ ...r, data })));
    schedine.push(...sch.filter((s) => s && Array.isArray(s.gambe)));
  }
  const perTipo = {};
  for (const tipo of ['doppia', 'tripla']) perTipo[tipo] = contaSchedine(schedine.filter((s) => s.tipo === tipo));
  return {
    da, a, giornate,
    tutti: conta(righe),
    migliori: conta(righe.filter((r) => r.migliore === true)),
    giocabili: conta(righe.filter((r) => r.giocabile === true)),
    perPartita: perPartita(righe),
    schedine: {
      ...contaSchedine(schedine),
      perTipo,
      conQuotaDaVerificare: contaSchedine(schedine.filter((s) => s.quotaDaVerificare === true || s.gambe.some((g) => g?.quotaDaVerificare === true))),
    },
  };
}

function principale() {
  const [da, a] = process.argv.slice(2);
  if (!DATA.test(da ?? '') || !DATA.test(a ?? '') || a < da) {
    console.error('Uso: npm run bilancio-pronostici -- <da> <a>   (date AAAA-MM-GG, per esempio 2026-10-19 2026-10-25)');
    process.exit(1);
  }
  const dirData = path.resolve(process.env.BET_DIR_DATA ?? 'data');
  console.log(JSON.stringify(bilancioPronosticiPeriodo(dirData, da, a), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principale();
