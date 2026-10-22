// Registro delle previsioni per la taratura (Fase 5): ogni mercato di ogni partita delle raccolte, con
// probabilità del modello e del mercato, quota del mattino, quota pre-partita (dai controlli 45-90 minuti
// prima delle partite, solo per le competizioni con una giocata: non è la quota di chiusura) ed esito.
// Un file per giornata: data/registro/<data>.json. Ogni mattina si completano gli esiti dei 4 giorni
// precedenti; quelli che mancano ancora si riprovano il giorno dopo. Le partite comparse dopo nella
// raccolta si aggiungono; gli esiti provvisori (cartellini e angoli da ESPN) si sostituiscono con quelli
// definitivi del CSV di football-data.co.uk quando arrivano [correzioni C3, C4].
// I pronostici sì/no si chiudono dalla loro istantanea (data/registro/<data>-pronostici.json, scritta dal
// giro), non dalle righe della raccolta: così si chiudono anche le partite che la raccolta non ha.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { partiRoma } from '../bankroll/settimana.js';
import { isoRoma } from '../calcio/testo.js';
import { CONFIG } from '../config.js';
import { leggiRaccolte } from '../giro/raccolte.js';
import { esitoPerRegistro, esitoConteggioDefinitivo } from '../esiti/rapidi.js';
import { bloccoEspn } from '../calcio/fonti/http.js';
import { CAMPIONATI_ESPN } from '../controlli/espn.js';
import { segnalaAvvisiFonti } from './avvisi-fonti.js';
import { espn } from '../controlli/espn.js';
import { eurolega } from '../basket/fonti/eurolega.js';
import { thesportsdb } from '../basket/fonti/thesportsdb.js';
import { footballDataUk } from '../calcio/fonti/football-data-uk.js';
import { esitoMultiplaBonus } from '../regole/multipla-bonus.js';
import { leggiIstantanea, fileIstantanea, GIORNI_ESITO_PRONOSTICI } from '../regole/pronostici.js';
import { aggiornaEsitiSchedine } from '../regole/schedine-pronostici.js';

// 4 giorni: i CSV di football-data.co.uk (campionati che ESPN non copre) si aggiornano due volte a settimana.
const GIORNI = 4;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const chiaveMercato = (idPartita, mercato, selezione) => `${idPartita}|${mercato}|${selezione}`;

const fileRegistro = (dirData, data) => path.join(dirData, 'registro', `${data}.json`);
export const filePrePartita = (dirData, data) => path.join(dirData, 'registro', `${data}-prepartita.json`);
// Vecchio nome (fino al 22/10/2026): mappa piatta partita|mercato|selezione → { quota, prob, alle }.
const fileChiusureVecchio = (dirData, data) => path.join(dirData, 'registro', `${data}-chiusure.json`);

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
        quotaPrePartita: null, probPrePartita: null, minutiPrima: null, esito: null, esitoProvvisorio: false,
      });
    }
  }
  return righe;
}

// Quote pre-partita della giornata: { quote, copertura } (dal file nuovo o dal vecchio -chiusure.json).
export function leggiPrePartita(dirData, data) {
  const nuovo = leggi(filePrePartita(dirData, data), null);
  if (nuovo && typeof nuovo === 'object') return { quote: { ...(nuovo.quote ?? {}) }, copertura: { ...(nuovo.copertura ?? {}) } };
  return { quote: { ...leggi(fileChiusureVecchio(dirData, data), {}) }, copertura: {} };
}

// Righe scritte prima del 23/10/2026: quotaChiusura/probChiusura → quotaPrePartita/probPrePartita.
function rinominaVecchiCampi(r) {
  if (!('quotaChiusura' in r) && !('probChiusura' in r)) return r;
  const { quotaChiusura, probChiusura, ...resto } = r;
  return {
    ...resto,
    quotaPrePartita: resto.quotaPrePartita ?? num(quotaChiusura),
    probPrePartita: resto.probPrePartita ?? num(probChiusura),
    minutiPrima: resto.minutiPrima ?? null,
  };
}

// Esiti che dipendono da ESPN: dopo un 403 non si chiede più a ESPN in questo giro.
const daEspn = (r) => r.sport === 'nba' || r.sport === 'tennis' || (r.sport === 'calcio' && Boolean(CAMPIONATI_ESPN[r.competizione]));

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
  const pronostici = [];
  // ESPN in 403 [correzione C5]: non si chiede più a ESPN in questo giro, si contano gli esiti saltati e
  // si scrive una riga chiara negli avvisi del giorno (il giro la mette fra gli errori della giornata).
  const espn = { bloccato: false, saltate: 0 };
  for (let i = GIORNI; i >= 1; i--) {
    const data = new Date(Date.parse(`${oggi}T12:00:00Z`) - i * 86400000).toISOString().slice(0, 10);
    // Pronostici: dall'istantanea, anche se la raccolta della giornata manca.
    const p = await chiudiPronostici({ dirData, data, adesso, f, cache, errori, espn, ultimo: i >= GIORNI_ESITO_PRONOSTICI });
    if (p) pronostici.push(p);
    let reg = leggi(fileRegistro(dirData, data), null);
    const { raccolta } = leggiRaccolte(dirData, data);
    if (!reg) {
      if (!raccolta) continue;
      reg = { data, creatoAlle: isoRoma(adesso), righe: righeDaRaccolta(raccolta) };
    } else {
      reg.righe = reg.righe.map(rinominaVecchiCampi);
      // Partite comparse dopo nella raccolta (un giro rifatto, una raccolta arrivata dopo) [correzione C4].
      if (raccolta) {
        const presenti = new Set(reg.righe.map((r) => chiaveMercato(r.idPartita, r.mercato, r.selezione)));
        reg.righe.push(...righeDaRaccolta(raccolta).filter((r) => !presenti.has(chiaveMercato(r.idPartita, r.mercato, r.selezione))));
      }
    }
    // Quote pre-partita salvate dai controlli prima delle partite (solo competizioni con una giocata).
    const pre = leggiPrePartita(dirData, data);
    for (const r of reg.righe) {
      const c = pre.quote[chiaveMercato(r.idPartita, r.mercato, r.selezione)];
      if (c && r.quotaPrePartita === null) { r.quotaPrePartita = num(c.quota); r.probPrePartita = num(c.prob); r.minutiPrima = num(c.minutiPrima); }
    }
    reg.coperturaPrePartita = Object.keys(pre.copertura).sort();
    // Esiti: il risultato di ogni partita si cerca una volta sola (cache), poi ogni mercato.
    // Cartellini e angoli da ESPN restano provvisori finché il CSV di football-data non dà i definitivi.
    let nuovi = 0;
    for (const r of reg.righe) {
      if (r.esito !== null && !r.esitoProvvisorio) continue;
      try {
        if (r.esito !== null) {
          // Provvisorio: si cerca solo il definitivo, senza chiedere di nuovo a ESPN.
          const e = await esitoConteggioDefinitivo(r, f);
          if (e) { r.esito = e; r.esitoProvvisorio = false; nuovi++; }
          continue;
        }
        if (espn.bloccato && daEspn(r)) { espn.saltate++; continue; }
        const e = await esitoPerRegistro(r, f, dirData, cache);
        if (e) { r.esito = e.esito; r.esitoProvvisorio = e.provvisorio; nuovi++; }
      } catch (err) {
        if (bloccoEspn(err)) { espn.bloccato = true; espn.saltate++; continue; }
        const m = `${r.partita}: ${err?.message ?? err}`;
        if (!errori.includes(m)) errori.push(m);
      }
    }
    reg.aggiornatoAlle = isoRoma(adesso);
    scrivi(fileRegistro(dirData, data), reg);
    aggiornaMultipleBonus(dirData, data, reg, adesso);
    riepilogo.push({ data, righe: reg.righe.length, conEsito: reg.righe.filter((r) => r.esito).length, nuovi });
  }
  if (espn.bloccato) {
    const riga = `ESPN ha negato l'accesso (HTTP 403) al registro della taratura: ${espn.saltate} esiti di pronostici e registro non aggiornati, si riprova domani`;
    errori.unshift(riga);
    segnalaAvvisiFonti(dirData, oggi, [riga]);
  }
  return { riepilogo, pronostici, errori };
}

// Esiti dei pronostici della giornata `data` dalla loro istantanea (se manca: dal file della giornata,
// e l'istantanea si scrive). Stesse fonti e regole degli altri esiti del calcio, solo esiti definitivi.
// `ultimo`: ultimo tentativo (4 giorni dopo); le partite ancora senza risultato diventano un errore.
async function chiudiPronostici({ dirData, data, adesso, f, cache, errori, espn, ultimo }) {
  const ist = leggiIstantanea(dirData, data);
  if (!ist) return null;
  let nuovi = 0;
  for (const r of ist.pronostici) {
    if (r.esito != null) continue;
    if (espn.bloccato && daEspn(r)) { espn.saltate++; continue; }
    try {
      const e = await esitoPerRegistro(r, f, dirData, cache);
      if (e && !e.provvisorio) { r.esito = e.esito; nuovi++; }
    } catch (err) {
      if (bloccoEspn(err)) { espn.bloccato = true; espn.saltate++; continue; }
      const m = `${r.partita}: ${err?.message ?? err}`;
      if (!errori.includes(m)) errori.push(m);
    }
  }
  // Con ESPN bloccato la guardia dei 4 giorni direbbe "partita non trovata": basta la riga di ESPN.
  if (ultimo && !espn.bloccato) {
    for (const partita of new Set(ist.pronostici.filter((r) => r.esito == null).map((r) => r.partita))) {
      errori.push(`Pronostici del ${data}: ${partita} senza esito dopo ${GIORNI_ESITO_PRONOSTICI} giorni (partita non trovata nella fonte degli esiti)`);
    }
  }
  // Doppie e triple (idea 4): esito dalle gambe, che sono pronostici di questa istantanea.
  const esitiRighe = new Map(ist.pronostici.filter((r) => r.esito).map((r) => [chiaveMercato(r.idPartita, r.mercato, r.selezione), r.esito]));
  const schedineCambiate = aggiornaEsitiSchedine(ist.schedine, esitiRighe, adesso);
  if (nuovi || ist.daGiornata || schedineCambiate) {
    const { daGiornata, ...resto } = ist;
    scrivi(fileIstantanea(dirData, data), { ...resto, aggiornataAlle: isoRoma(adesso) });
  }
  aggiornaPronostici(dirData, data, ist.pronostici, adesso);
  return { data, n: ist.pronostici.length, conEsito: ist.pronostici.filter((r) => r.esito != null).length, nuovi };
}

// Esiti delle multiple bonus della giornata `data` dalle righe del registro (stesse partite e mercati).
// Con `adesso`: una gamba ancora senza risultato `giorniRimborso` giorni dopo l'inizio (partita rinviata o
// sospesa) è rimborsata, come fa bet365 [correzione C1]. Il file della giornata si riscrive solo se cambia qualcosa.
export function aggiornaMultipleBonus(dirData, data, reg, adesso = null) {
  const file = path.join(dirData, 'giornate', `${data}.json`);
  const g = leggi(file, null);
  if (!g || !Array.isArray(g.multipleBonus) || !g.multipleBonus.length) return false;
  const esiti = new Map(reg.righe.filter((r) => r.esito && !r.esitoProvvisorio).map((r) => [chiaveMercato(r.idPartita, r.mercato, r.selezione), r.esito]));
  let cambiato = false;
  for (const mb of g.multipleBonus) {
    for (const gamba of mb.gambe ?? []) {
      const e = esiti.get(chiaveMercato(gamba.idPartita, gamba.mercato, gamba.selezione)) ?? null;
      if (e && gamba.esito !== e) { gamba.esito = e; cambiato = true; }
      const giorni = CONFIG.multiplaBonus.giorniRimborso;
      if (!e && gamba.esito == null && adesso && adesso.getTime() - Date.parse(gamba.inizio) >= giorni * 86400000) {
        gamba.esito = 'rimborsata';
        gamba.motivoEsito = `nessun risultato dopo ${giorni} giorni (partita rinviata o sospesa)`;
        cambiato = true;
      }
    }
    const r = esitoMultiplaBonus(mb);
    if (r.esito !== mb.esito || r.ritorno !== mb.ritorno) { mb.esito = r.esito; mb.ritorno = r.ritorno; cambiato = true; }
  }
  if (cambiato) scrivi(file, g);
  return cambiato;
}

// Esiti dei pronostici sì/no della giornata `data` dalle righe della loro istantanea (solo esiti definitivi).
export function aggiornaPronostici(dirData, data, righe, adesso = null) {
  const file = path.join(dirData, 'giornate', `${data}.json`);
  const g = leggi(file, null);
  if (!g || !Array.isArray(g.pronostici) || !g.pronostici.length) return false;
  const esiti = new Map(righe.filter((r) => r.esito).map((r) => [chiaveMercato(r.idPartita, r.mercato, r.selezione), r.esito]));
  let cambiato = false;
  for (const p of g.pronostici) {
    for (const x of p.pronostici ?? []) {
      const e = esiti.get(chiaveMercato(p.idPartita, x.mercato, x.selezione)) ?? null;
      if (e && x.esito !== e) { x.esito = e; cambiato = true; }
    }
  }
  if (aggiornaEsitiSchedine(g.schedinePronostici, esiti, adesso)) cambiato = true;
  if (cambiato) scrivi(file, g);
  return cambiato;
}

async function principale() {
  const r = await aggiornaRegistro({ dirData: 'data', adesso: new Date() });
  for (const x of r.riepilogo) console.log(`Registro ${x.data}: ${x.righe} mercati, ${x.conEsito} con esito (${x.nuovi} nuovi)`);
  for (const x of r.pronostici) console.log(`Pronostici ${x.data}: ${x.n}, ${x.conEsito} con esito (${x.nuovi} nuovi)`);
  for (const e of r.errori.slice(0, 20)) console.log(`- ${e}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Registro non aggiornato: ${e?.message ?? e}`);
  });
}
