// Registro delle previsioni per la taratura (Fase 5): ogni mercato di ogni partita delle raccolte, con
// probabilità del modello e del mercato, quota del mattino, quota di chiusura (dai controlli prima delle
// partite) ed esito. Un file per giornata: data/registro/<data>.json. Ogni mattina si completano gli
// esiti dei 4 giorni precedenti; quelli che mancano ancora si riprovano il giorno dopo.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { partiRoma } from '../bankroll/settimana.js';
import { isoRoma } from '../calcio/testo.js';
import { leggiRaccolte } from '../giro/raccolte.js';
import { esitoPerRegistro } from '../esiti/rapidi.js';
import { espn } from '../controlli/espn.js';
import { eurolega } from '../basket/fonti/eurolega.js';
import { thesportsdb } from '../basket/fonti/thesportsdb.js';
import { footballDataUk } from '../calcio/fonti/football-data-uk.js';
import { esitoMultiplaBonus } from '../regole/multipla-bonus.js';

// 4 giorni: i CSV di football-data.co.uk (campionati che ESPN non copre) si aggiornano due volte a settimana.
const GIORNI = 4;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const chiaveMercato = (idPartita, mercato, selezione) => `${idPartita}|${mercato}|${selezione}`;

const fileRegistro = (dirData, data) => path.join(dirData, 'registro', `${data}.json`);
export const fileChiusure = (dirData, data) => path.join(dirData, 'registro', `${data}-chiusure.json`);

function leggi(file, ripiego) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return ripiego; }
}
const scrivi = (file, x) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(x, null, 2)}\n`);
};

// Righe del registro dalla raccolta unita di una giornata (tutti gli sport).
export function righeDaRaccolta(raccolta) {
  const righe = [];
  for (const p of raccolta?.partite ?? []) {
    for (const m of p?.mercati ?? []) {
      righe.push({
        sport: p.sport ?? 'calcio', competizione: p.competizione, idPartita: p.idPartita, partita: p.partita, inizio: p.inizio,
        modello: p.modello ?? null, pesoModello: num(p.pesoModello),
        mercato: m.mercato, selezione: m.selezione,
        probModello: num(m.probModello), probMercato: num(m.probPinnacle), riferimento: m.etichettaMercato ?? 'Pinnacle',
        quota: num(m.quota), frequenzaCampionato: num(m.frequenzaCampionato),
        quotaChiusura: null, probChiusura: null, esito: null, esitoProvvisorio: false,
      });
    }
  }
  return righe;
}

// Fonti con memoria: la stessa richiesta (stessi argomenti) si fa una volta sola per esecuzione.
function conMemoria(fonti) {
  const out = {};
  for (const [nome, f] of Object.entries(fonti)) {
    if (!f || typeof f !== 'object') { out[nome] = f; continue; }
    const cache = new Map();
    out[nome] = Object.fromEntries(Object.entries(f).map(([k, fn]) => [k, typeof fn !== 'function' ? fn : (...a) => {
      const chiave = `${k}|${JSON.stringify(a)}`;
      if (!cache.has(chiave)) cache.set(chiave, fn.apply(f, a));
      return cache.get(chiave);
    }]));
  }
  return out;
}

const fontiDefault = () => ({ espn, eurolega, thesportsdb, footballDataUk, opz: {} });

// Completa il registro dei giorni passati (fino a GIORNI fa): righe dalle raccolte, chiusure, esiti.
export async function aggiornaRegistro({ dirData, adesso, fonti = fontiDefault() }) {
  // Data di calendario a Roma (la giornata di gioco cambia alle 8, dopo la raccolta del mattino).
  const r = partiRoma(adesso);
  const oggi = new Date(Date.UTC(r.anno, r.mese - 1, r.giorno)).toISOString().slice(0, 10);
  const f = conMemoria(fonti);
  const cache = new Map();
  const errori = [];
  const riepilogo = [];
  for (let i = GIORNI; i >= 1; i--) {
    const data = new Date(Date.parse(`${oggi}T12:00:00Z`) - i * 86400000).toISOString().slice(0, 10);
    let reg = leggi(fileRegistro(dirData, data), null);
    if (!reg) {
      const { raccolta } = leggiRaccolte(dirData, data);
      if (!raccolta) continue;
      reg = { data, creatoAlle: isoRoma(adesso), righe: righeDaRaccolta(raccolta) };
    }
    // Quote di chiusura salvate dai controlli prima delle partite.
    const chiusure = leggi(fileChiusure(dirData, data), {});
    for (const r of reg.righe) {
      const c = chiusure[chiaveMercato(r.idPartita, r.mercato, r.selezione)];
      if (c && r.quotaChiusura === null) { r.quotaChiusura = num(c.quota); r.probChiusura = num(c.prob); }
    }
    // Esiti: il risultato di ogni partita si cerca una volta sola (cache), poi ogni mercato.
    // Cartellini e angoli da ESPN restano segnati come provvisori.
    let nuovi = 0;
    for (const r of reg.righe) {
      if (r.esito !== null) continue;
      try {
        const e = await esitoPerRegistro(r, f, dirData, cache);
        if (e) { r.esito = e.esito; r.esitoProvvisorio = e.provvisorio; nuovi++; }
      } catch (err) {
        const m = `${r.partita}: ${err?.message ?? err}`;
        if (!errori.includes(m)) errori.push(m);
      }
    }
    reg.aggiornatoAlle = isoRoma(adesso);
    scrivi(fileRegistro(dirData, data), reg);
    aggiornaMultipleBonus(dirData, data, reg);
    aggiornaPronostici(dirData, data, reg);
    riepilogo.push({ data, righe: reg.righe.length, conEsito: reg.righe.filter((r) => r.esito).length, nuovi });
  }
  return { riepilogo, errori };
}

// Esiti delle multiple bonus della giornata `data` dalle righe del registro (stesse partite e mercati).
// Il file della giornata si riscrive solo se cambia qualcosa.
export function aggiornaMultipleBonus(dirData, data, reg) {
  const file = path.join(dirData, 'giornate', `${data}.json`);
  const g = leggi(file, null);
  if (!g || !Array.isArray(g.multipleBonus) || !g.multipleBonus.length) return false;
  const esiti = new Map(reg.righe.filter((r) => r.esito && !r.esitoProvvisorio).map((r) => [chiaveMercato(r.idPartita, r.mercato, r.selezione), r.esito]));
  let cambiato = false;
  for (const mb of g.multipleBonus) {
    for (const gamba of mb.gambe ?? []) {
      const e = esiti.get(chiaveMercato(gamba.idPartita, gamba.mercato, gamba.selezione)) ?? null;
      if (e && gamba.esito !== e) { gamba.esito = e; cambiato = true; }
    }
    const r = esitoMultiplaBonus(mb);
    if (r.esito !== mb.esito || r.ritorno !== mb.ritorno) { mb.esito = r.esito; mb.ritorno = r.ritorno; cambiato = true; }
  }
  if (cambiato) scrivi(file, g);
  return cambiato;
}

// Esiti dei pronostici sì/no della giornata `data`, dalle righe del registro (solo esiti definitivi).
export function aggiornaPronostici(dirData, data, reg) {
  const file = path.join(dirData, 'giornate', `${data}.json`);
  const g = leggi(file, null);
  if (!g || !Array.isArray(g.pronostici) || !g.pronostici.length) return false;
  const esiti = new Map(reg.righe.filter((r) => r.esito && !r.esitoProvvisorio).map((r) => [chiaveMercato(r.idPartita, r.mercato, r.selezione), r.esito]));
  let cambiato = false;
  for (const p of g.pronostici) {
    for (const x of p.pronostici ?? []) {
      const e = esiti.get(chiaveMercato(p.idPartita, x.mercato, x.selezione)) ?? null;
      if (e && x.esito !== e) { x.esito = e; cambiato = true; }
    }
  }
  if (cambiato) scrivi(file, g);
  return cambiato;
}

async function principale() {
  const r = await aggiornaRegistro({ dirData: 'data', adesso: new Date() });
  for (const x of r.riepilogo) console.log(`Registro ${x.data}: ${x.righe} mercati, ${x.conEsito} con esito (${x.nuovi} nuovi)`);
  for (const e of r.errori.slice(0, 20)) console.log(`- ${e}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Registro non aggiornato: ${e?.message ?? e}`);
  });
}
