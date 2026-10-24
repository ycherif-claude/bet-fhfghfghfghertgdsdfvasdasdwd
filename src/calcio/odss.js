// Quote dei bookmaker italiani dell'utente da odss-api.com [utente, 22/10/2026, idea 1].
// - Download (raccolta su GitHub, dove c'è il secret): 1x2, dc e ou del calcio per la giornata, con budget
//   (CONFIG.odss.richiesteGiorno al giorno, mai sotto CONFIG.odss.riserva rimaste; stato in data/stato/odss.json).
//   Si salva in data/raccolta/<data>-odss.json solo il necessario: quote dei bookmaker dell'utente e probabilità
//   di consenso senza margine (Pinnacle se c'è, altrimenti la mediana dei bookmaker).
// - Per la stessa partita l'API dà più righe dello stesso mercato (partita intera, primo e secondo tempo):
//   si usa solo quella con period "full_time" (il resto si ignora, mai indovinare).
// - Il giro abbina gli eventi alle partite della giornata (stesse squadre, inizio vicino; ambiguo → nessuno).
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { finestraGiornata, isoRoma, normalizzaNome, oraRoma } from './testo.js';
import { nomeCanonico } from './squadre.js';
import { stessaSquadra } from '../controlli/espn.js';
import { odss } from './fonti/odss.js';
import { creaBudgetOdss } from '../odss/budget.js';
import { scaricaOdss } from '../odss/scarica.js';

const O = CONFIG.odss;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const arrotonda = (x) => Math.round(x * 10000) / 10000;
const oggetto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// Nomi da mostrare dei bookmaker dell'utente.
export const NOMI_BOOKMAKER = Object.freeze({ bet365: 'bet365', snai: 'Snai', goldbet: 'Goldbet', sportium: 'Sportium', daznbet: 'DAZN Bet' });
export const nomeBookmaker = (chiave) => NOMI_BOOKMAKER[chiave] ?? String(chiave ?? '');

// Esiti di ogni mercato. Doppia chance: ogni esito copre due risultati su tre (le probabilità sommano a 2).
const ESITI = { '1x2': ['HOME', 'DRAW', 'AWAY'], dc: ['12', '1X', 'X2'], ou: ['UNDER', 'OVER'] };
const COPERTURA = { dc: 2 };
const EXCHANGE = /betfair|matchbook|smarkets|betdaq|exchange/i;

// ---- Solo la riga della partita intera ----

// Valori reali (secondo collaudo, 22/10/2026): scope sempre "match", period "full_time", "1st_half" o "2nd_half".
// Si usa solo "full_time": nessuna euristica sui nomi, il resto si ignora.
const PERIODO_INTERO = 'full_time';
const vuoto = (v) => v === undefined || v === null || v === '';
const intera = (r) => r.scope === 'match' && r.period === PERIODO_INTERO;

const chiaveEvento = (r) => String(r.event_id ?? `${r.home_team}|${r.away_team}|${r.commence_time}`);
const chiaveGruppo = (r) => `${chiaveEvento(r)}|${r.market}|${vuoto(r.line) ? '' : Number(r.line)}`;

// Per ogni evento, mercato e linea, l'unica riga con scope "match" e period "full_time" (due o più: nessuna).
// { righe, doppie (gruppi con più righe full_time), senzaIntero: [{ id, partita }] (eventi con righe ma nessuna
// full_time in nessun mercato), periodiVisti: { 'scope|period': n } (diagnostica) }.
export function scegliPartitaIntera(righe) {
  const gruppi = new Map();
  const periodiVisti = {};
  const eventi = new Map();
  for (const r of Array.isArray(righe) ? righe : []) {
    if (!oggetto(r)) continue;
    const k = `${vuoto(r.scope) ? '(assente)' : r.scope}|${vuoto(r.period) ? '(assente)' : r.period}`;
    periodiVisti[k] = (periodiVisti[k] ?? 0) + 1;
    const ev = chiaveEvento(r);
    if (!eventi.has(ev)) eventi.set(ev, { id: ev, partita: r.event ?? `${r.home_team} - ${r.away_team}`, intera: false });
    if (!intera(r)) continue;
    eventi.get(ev).intera = true;
    const g = chiaveGruppo(r);
    if (!gruppi.has(g)) gruppi.set(g, []);
    gruppi.get(g).push(r);
  }
  const scelte = [];
  let doppie = 0;
  for (const lista of gruppi.values()) {
    if (lista.length === 1) scelte.push(lista[0]);
    else doppie++;
  }
  const senzaIntero = [...eventi.values()].filter((x) => !x.intera).map(({ id, partita }) => ({ id, partita }));
  return { righe: scelte, doppie, senzaIntero, periodiVisti };
}

// ---- Quote dei miei bookmaker e probabilità di consenso ----

const quotaValida = (q) => num(q) && q > 1;

// Probabilità senza margine di un bookmaker con tutti gli esiti: (1/q) / somma, × copertura (2 per la doppia chance).
function senzaMargine(outcomes, esiti, copertura) {
  if (!oggetto(outcomes) || !esiti.every((e) => quotaValida(outcomes[e]))) return null;
  const somma = esiti.reduce((s, e) => s + 1 / outcomes[e], 0);
  return Object.fromEntries(esiti.map((e) => [e, (copertura / outcomes[e]) / somma]));
}

function mediana(valori) {
  const v = [...valori].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Esiti sospesi di un bookmaker: nel feed reale `suspended` è un elenco di esiti ([] o ["AWAY"]); true = tutti.
const sospesi = (b) => new Set(Array.isArray(b.suspended) ? b.suspended.map(String) : []);
const eExchange = (b) => b.is_exchange === true || EXCHANGE.test(b.key);
// Riga senza margine di un bookmaker: nessuna se anche un solo esito della riga è sospeso.
const senzaMargineLibro = (b, esiti, copertura) => (esiti.some((e) => sospesi(b).has(e)) ? null : senzaMargine(b.outcomes, esiti, copertura));

// Riga compatta: { miei: { bookmaker: { quote, aggiornato } }, prob: { esito: p } | null, fonteProb, mediana }.
// mediana: { esito: { quota, n } } dei bookmaker non exchange con quell'esito non sospeso (almeno
// CONFIG.calcio.minBookmaker), per difetto al centesimo: è la quota che usa il modello della raccolta.
// miei: senza gli esiti sospesi e, con `adesso`, senza le quote aggiornate da più di CONFIG.odss.oreMaxQuota ore
// (o senza orario). prob: Pinnacle senza margine se c'è; altrimenti la mediana delle probabilità senza margine di
// almeno CONFIG.calcio.minBookmaker bookmaker (exchange fuori, anche con `is_exchange`; righe con un esito sospeso fuori).
export function riassuntoMercato(riga, { adesso = null } = {}) {
  const esiti = ESITI[riga?.market] ?? [];
  const copertura = COPERTURA[riga?.market] ?? 1;
  // Un bookmaker con un orario d'inizio diverso (start_time) di più di CONFIG.odss.toleranzaInizioOre: fuori, come
  // in src/odss/eventi.js (può essere un'altra partita con lo stesso nome).
  const inizio = Date.parse(riga?.commence_time);
  // Pinnacle fermo da più di CONFIG.odss.oreMaxPinnacle ore: fuori anche dal consenso, vale il consenso degli altri.
  const pinFresco = (b) => !adesso || !Number.isFinite(Date.parse(b.last_update)) || adesso.getTime() - Date.parse(b.last_update) <= O.oreMaxPinnacle * 3600000;
  const stessoInizio = (b) => !Object.hasOwn(b, 'start_time')
    || (Number.isFinite(Date.parse(b.start_time)) && Number.isFinite(inizio) && Math.abs(Date.parse(b.start_time) - inizio) <= O.toleranzaInizioOre * 3600000);
  const libri = (Array.isArray(riga?.bookmakers) ? riga.bookmakers : [])
    .filter((b) => oggetto(b) && typeof b.key === 'string' && b.suspended !== true && stessoInizio(b)
      && (b.key.toLowerCase() !== 'pinnacle' || pinFresco(b)));
  const fresca = (b) => {
    if (!adesso) return true;
    const t = Date.parse(b.last_update);
    return Number.isFinite(t) && adesso.getTime() - t <= O.oreMaxQuota * 3600000;
  };
  const miei = {};
  for (const b of libri) {
    const chiave = b.key.toLowerCase();
    if (!O.miei.includes(chiave) || !fresca(b)) continue;
    const fuori = sospesi(b);
    const quote = Object.fromEntries(esiti.filter((e) => !fuori.has(e) && quotaValida(b.outcomes?.[e])).map((e) => [e, b.outcomes[e]]));
    if (Object.keys(quote).length) miei[chiave] = { quote, aggiornato: b.last_update ?? null };
  }
  let prob = null;
  let fonteProb = null;
  const pin = libri.find((b) => b.key.toLowerCase() === 'pinnacle');
  const pinProb = pin ? senzaMargineLibro(pin, esiti, copertura) : null;
  if (pinProb) {
    prob = pinProb;
    fonteProb = 'Pinnacle';
  } else {
    const tutte = libri.filter((b) => !eExchange(b)).map((b) => senzaMargineLibro(b, esiti, copertura)).filter(Boolean);
    if (tutte.length >= CONFIG.calcio.minBookmaker) {
      prob = Object.fromEntries(esiti.map((e) => [e, mediana(tutte.map((p) => p[e]))]));
      fonteProb = `mediana di ${tutte.length} bookmaker`;
    }
  }
  if (prob) prob = Object.fromEntries(Object.entries(prob).map(([e, p]) => [e, arrotonda(p)]));
  const mediane = {};
  for (const e of esiti) {
    const quote = libri.filter((b) => !eExchange(b) && !sospesi(b).has(e) && quotaValida(b.outcomes?.[e])).map((b) => b.outcomes[e]);
    if (quote.length >= CONFIG.calcio.minBookmaker) mediane[e] = { quota: Math.floor(mediana(quote) * 100 + 1e-9) / 100, n: quote.length };
  }
  return { miei, prob, fonteProb, mediana: mediane };
}

const chiaveMercato = (r) => (r.market === 'ou' ? `ou|${Number(r.line)}` : r.market);

// Eventi compatti dalle righe scelte: { id, campionato, casa, trasferta, inizio, mercati: { '1x2', 'dc', 'ou|1.5', … } }.
export function eventiOdss(righe, { adesso = null } = {}) {
  const eventi = new Map();
  for (const r of righe) {
    if (!ESITI[r.market] || !r.home_team || !r.away_team || !Number.isFinite(Date.parse(r.commence_time))) continue;
    if (r.market === 'ou' && !O.lineeOu.includes(Number(r.line))) continue;
    const m = riassuntoMercato(r, { adesso });
    if (!Object.keys(m.miei).length && !m.prob && !Object.keys(m.mediana).length) continue;
    const k = chiaveEvento(r);
    if (!eventi.has(k)) {
      eventi.set(k, { id: k, campionato: r.league ?? null, casa: r.home_team, trasferta: r.away_team, inizio: r.commence_time, mercati: {} });
    }
    eventi.get(k).mercati[chiaveMercato(r)] = m;
  }
  return [...eventi.values()].sort((a, b) => Date.parse(a.inizio) - Date.parse(b.inizio) || a.id.localeCompare(b.id));
}

// ---- Download con budget ----

// { file (contenuto di data/raccolta/<data>-odss.json), stato (data/stato/odss.json), richieste (di questo giro) }.
// Budget unico di odss-api (src/odss/budget.js): il calcio al massimo CONFIG.odss.tetti.calcio richieste, dentro il
// tetto del giro del mattino. file.esito: 'ok' | 'senza chiave' | 'budget' | 'chiave' | 'limite' | 'errore'
// (la raccolta del calcio torna a The Odds API se il file non ha eventi).
export async function scaricaQuoteOdss({ data, adesso, chiave, stato, fetch = globalThis.fetch, fonte = odss, attesaMs = 2000 }) {
  const budget = creaBudgetOdss({ stato, data, adesso, sport: 'calcio' });
  const erroriGiro = [];
  const errore = (m) => erroriGiro.push(`odss-api alle ${oraRoma(adesso)}: ${m}`);
  let tutte = [];
  let richieste = 0;
  let esito = 'ok';
  if (!chiave) {
    errore('manca il secret ODSS_API_KEY: niente quote dei bookmaker italiani oggi');
    esito = 'senza chiave';
  } else {
    const r = await scaricaOdss({
      chiave, budget, sport: 'calcio', gruppi: O.mercati, finestra: finestraGiornata(data), fetch, fonte, attesaMs, errore, limite: O.limite,
      suffissoBudget: ': niente quote dei bookmaker italiani oggi',
    });
    tutte = r.righe;
    richieste = r.richieste;
    if (r.fermo) esito = r.fermo;
    else if (!r.ok) esito = 'errore';
  }
  const scelta = scegliPartitaIntera(tutte);
  const senza = scelta.senzaIntero;
  if (senza.length) {
    errore(`${senza.length} ${senza.length === 1 ? 'partita' : 'partite'} senza righe a tempo intero (full_time), senza quote: ${senza.map((x) => x.partita).join(', ')}`);
  }
  if (scelta.doppie) errore(`${scelta.doppie} mercati con più righe full_time per la stessa partita, ignorati`);
  const st = budget.stato();
  const file = {
    data, generataAlle: isoRoma(adesso), fonte: 'odss-api.com', esito, richieste, rimaste: st.rimaste,
    diagnostica: { righe: tutte.length, righeUsate: scelta.righe.length, senzaIntero: senza.length, doppie: scelta.doppie, periodiVisti: scelta.periodiVisti },
    erroriGiro, eventi: eventiOdss(scelta.righe, { adesso }),
  };
  return { file, stato: st, richieste };
}

const leggi = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
};
const scrivi = (file, dati) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(dati, null, 2)}\n`);
};
export const fileQuoteOdss = (dirData, data) => path.join(dirData, 'raccolta', `${data}-odss.json`);
const fileStato = (dirData) => path.join(dirData, 'stato', 'odss.json');

// Raccolta del mattino: scarica, aggiorna lo stato e scrive il file della giornata. Un secondo giro senza quote
// nuove (budget finito, errore) non cancella le quote buone già salvate oggi.
export async function eseguiRaccoltaOdss({ dirData, data, adesso, chiave, fetch = globalThis.fetch, attesaMs = 2000 }) {
  const r = await scaricaQuoteOdss({ data, adesso, chiave, stato: leggi(fileStato(dirData)), fetch, attesaMs });
  scrivi(fileStato(dirData), r.stato);
  const file = fileQuoteOdss(dirData, data);
  const prima = leggi(file);
  const tenuto = !r.file.eventi.length && prima?.data === data && Array.isArray(prima.eventi) && prima.eventi.length > 0;
  if (!tenuto) scrivi(file, r.file);
  return { ...r, tenuto };
}

// Quote salvate della giornata per il giro: { eventi: [...] | null, errori: [righe per erroriGiro] }.
// eventi null se il file manca o non si legge.
export function leggiQuoteOdss(dirData, oggi) {
  const rel = `data/raccolta/${oggi}-odss.json`;
  const file = fileQuoteOdss(dirData, oggi);
  if (!fs.existsSync(file)) return { eventi: null, errori: [], mancante: true };
  const r = leggi(file);
  if (!oggetto(r) || !Array.isArray(r.eventi)) return { eventi: null, errori: [`Quote dei bookmaker italiani (odss-api) illeggibili: ${rel}`] };
  if (r.data !== oggi) return { eventi: null, errori: [`Quote dei bookmaker italiani (odss-api) mancanti: ${rel} (il file è del ${r.data})`] };
  return { eventi: r.eventi.filter(oggetto), errori: (Array.isArray(r.erroriGiro) ? r.erroriGiro : []).filter((x) => typeof x === 'string') };
}

// ---- Abbinamento alle partite della giornata ----

const lati = (p) => {
  if (p.casa && p.trasferta) return { casa: p.casa, trasferta: p.trasferta };
  const i = String(p.partita ?? '').indexOf(' - ');
  return i < 0 ? null : { casa: p.partita.slice(0, i), trasferta: p.partita.slice(i + 3) };
};
const simile = (a, b) => stessaSquadra(a, b) || nomeCanonico(a, [b]) === b;

// Squadre femminili, giovanili, seconde squadre e riserve: un evento con uno di questi marcatori non va mai a una
// partita il cui nome non ce l'ha ("Inter Women" non è "Inter").
const MARCATORI = ['women', 'woman', 'femminile', 'femenino', 'feminin', 'feminine', 'ladies', 'frauen', 'dames', 'w',
  'u17', 'u18', 'u19', 'u20', 'u21', 'u22', 'u23', 'ii', 'iii', 'b', 'next-gen', 'nextgen', 'reserves', 'reserve', 'riserve', 'primavera', 'youth', 'academy', 'jong'];
function marcatori(nome) {
  const parole = normalizzaNome(nome).split('-').filter(Boolean);
  const testo = `-${parole.join('-')}-`;
  return MARCATORI.filter((m) => testo.includes(`-${m}-`));
}
const stessiMarcatori = (evento, nostro) => { const n = marcatori(nostro); return marcatori(evento).every((m) => n.includes(m)); };
// Campionato femminile ("Serie A Femminile", "Serie A (W)", "Frauen-Bundesliga"…): mai a una partita che non lo è.
const DONNE = ['women', 'woman', 'femminile', 'femenino', 'feminin', 'feminine', 'ladies', 'frauen', 'dames', 'w'];
const campionatoFemminile = (nome) => marcatori(nome ?? '').some((m) => DONNE.includes(m));

// Map idPartita → evento odss. Solo calcio; stesse squadre (casa con casa, trasferta con trasferta) e inizio entro
// CONFIG.odss.toleranzaOre. Prima i nomi uguali o con alias noti; solo se nessuno, i nomi simili. Più eventi
// possibili, oppure lo stesso evento per più partite → nessun abbinamento.
export function abbinaEventiOdss(partite, eventi) {
  const tolleranza = O.toleranzaOre * 3600000;
  const lista = (Array.isArray(eventi) ? eventi : []).filter((e) => oggetto(e) && e.casa && e.trasferta && Number.isFinite(Date.parse(e.inizio)));
  const scelti = new Map();
  for (const p of Array.isArray(partite) ? partite : []) {
    if (!oggetto(p) || (p.sport ?? 'calcio') !== 'calcio' || !p.idPartita) continue;
    const sq = lati(p);
    const t = Date.parse(p.inizio);
    if (!sq || !Number.isFinite(t)) continue;
    const vicini = lista.filter((e) => Math.abs(Date.parse(e.inizio) - t) <= tolleranza
      && (!campionatoFemminile(e.campionato) || marcatori(`${sq.casa} ${sq.trasferta}`).some((m) => DONNE.includes(m)))
      && stessiMarcatori(e.casa, sq.casa) && stessiMarcatori(e.trasferta, sq.trasferta));
    const esatti = vicini.filter((e) => stessaSquadra(e.casa, sq.casa) && stessaSquadra(e.trasferta, sq.trasferta));
    const candidati = esatti.length ? esatti : vicini.filter((e) => simile(e.casa, sq.casa) && simile(e.trasferta, sq.trasferta));
    if (candidati.length === 1) scelti.set(p.idPartita, candidati[0]);
  }
  const usi = new Map();
  for (const e of scelti.values()) usi.set(e, (usi.get(e) ?? 0) + 1);
  for (const [id, e] of scelti) if (usi.get(e) > 1) scelti.delete(id);
  return scelti;
}

// ---- Quote di un pronostico ----

const ORDINE_MIEI = (k) => { const i = O.miei.indexOf(k); return i < 0 ? O.miei.length : i; };

// Mercato e selezione dei pronostici → mercato odss ed esito. Gol casa/ospite: nessun mercato squadra → null.
export function mercatoOdss(mercato, selezione) {
  if (mercato === '1X2') {
    const esito = { 1: 'HOME', X: 'DRAW', 2: 'AWAY' }[selezione];
    return esito ? { chiave: '1x2', esito } : null;
  }
  if (mercato === 'Doppia chance') return ['1X', 'X2', '12'].includes(selezione) ? { chiave: 'dc', esito: selezione } : null;
  const m = /^Under\/Over (\d+\.5)$/.exec(mercato);
  const s = /^(Over|Under) (\d+\.5)$/.exec(selezione);
  if (!m || !s || s[2] !== m[1]) return null;
  return { chiave: `ou|${Number(m[1])}`, esito: s[1].toUpperCase() };
}

// { quoteMiei: [{ bookmaker, quota, aggiornato }] (dalla più alta), quotaMigliore, bookmakerMigliore, oraQuota,
//   probConsenso, fonteConsenso } oppure null se l'evento non ha quel mercato.
export function quoteOdssPronostico(evento, mercato, selezione) {
  const k = mercatoOdss(mercato, selezione);
  const r = k ? evento?.mercati?.[k.chiave] : null;
  if (!oggetto(r)) return null;
  const quoteMiei = Object.entries(oggetto(r.miei) ? r.miei : {})
    .map(([bookmaker, b]) => ({ bookmaker, quota: b?.quote?.[k.esito], aggiornato: b?.aggiornato ?? null }))
    .filter((x) => quotaValida(x.quota))
    .sort((a, b) => b.quota - a.quota || ORDINE_MIEI(a.bookmaker) - ORDINE_MIEI(b.bookmaker));
  const prob = num(r.prob?.[k.esito]) ? r.prob[k.esito] : null;
  if (!quoteMiei.length && prob === null) return null;
  const [m] = quoteMiei;
  return {
    quoteMiei, quotaMigliore: m?.quota ?? null, bookmakerMigliore: m?.bookmaker ?? null, oraQuota: m?.aggiornato ?? null,
    probConsenso: prob, fonteConsenso: prob === null ? null : r.fonteProb ?? null,
  };
}
