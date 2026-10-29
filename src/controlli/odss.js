// Quote dell'ultimo momento da odss-api per i controlli pre-partita [utente, 22/10/2026]: una sola richiesta per
// passaggio con tutti gli sport e i mercati delle voci da controllare, solo per i loro event_id [correzioni 24/10/2026,
// punto 4] (senza finestra: una pagina, mai "quote incomplete"), presi dalle raccolte del mattino: calcio dagli eventi
// di data/raccolta/<data>-odss.json abbinati alla partita, gli altri sport da `idOdss` della partita in
// data/raccolta/<data>-<sport>.json. Voci senza event_id: niente richiesta, fonti di prima. Tetto dei controlli del
// budget (CONFIG.odss.tetti.controlli al giorno, mai sotto la riserva). Map(id voce → { quota, n, prob }) solo per le voci con una quota: le altre (partita non trovata, mercato
// che odss non ha, budget finito, errore) restano alle fonti di prima.
import { creaBudgetOdss, leggiStatoOdss, scriviStatoOdss } from '../odss/budget.js';
import { scaricaOdss } from '../odss/scarica.js';
import { abbinaEventi, eventiDaRighe, femminile, inFormatoCalcio, inFormatoNba, inFormatoTennis, legaAmmessa, tennisSingolare } from '../odss/eventi.js';
import { CAMPIONATI_PALLAVOLO } from '../pallavolo/campionati.js';
import { abbinaSquadra, squadreStorico } from '../pallavolo/squadre.js';
import { leggiStorico } from '../basket/storico.js';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { abbinaEventiOdss, candidatiOdss, leggiQuoteOdss, unisciRigheEventi } from '../calcio/odss.js';
import { stessoGiocatore } from '../tennis/raccolta.js';
import { squadraNba } from '../nba/squadre.js';
import { stessaSquadra } from './espn.js';
import { quotaCalcio, quotaFormatoNba, quotaTennis, squadreDi } from './quote.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);

// event_id di odss della voce (stringhe), dalle raccolte del mattino; [] se non si sanno.
function idOdssVoce(v, dirData, data, cache) {
  const sq = squadreDi(v.partita);
  if (v.sport === 'calcio') {
    cache.calcio ??= leggiQuoteOdss(dirData, data).eventi ?? [];
    if (!sq) return [];
    const lista = candidatiOdss([{ idPartita: v.id, sport: 'calcio', casa: sq.casa, trasferta: sq.trasferta, inizio: v.inizio }], cache.calcio).get(v.id) ?? [];
    return [...new Set(lista.flatMap((e) => String(e.id).split(',')))];
  }
  if (!Object.hasOwn(cache, v.sport)) {
    try {
      cache[v.sport] = JSON.parse(fs.readFileSync(path.join(dirData, 'raccolta', `${data}-${v.sport}.json`), 'utf8')).partite ?? [];
    } catch { cache[v.sport] = []; }
  }
  const p = (Array.isArray(cache[v.sport]) ? cache[v.sport] : []).find((x) => x?.idPartita === v.idPartita);
  return Array.isArray(p?.idOdss) ? p.idOdss.map(String) : [];
}

// Sport delle voci → sport e mercati di odss-api.
const SPORT = {
  // dc: Doppia chance (giocate e chiusura delle partite di coppie e multiple).
  calcio: { odss: 'calcio', mercati: ['1x2', 'dc', 'ou'] },
  tennis: { odss: 'tennis', mercati: ['moneyline'] },
  nba: { odss: 'basket', mercati: ['moneyline', 'ah', 'ou'] },
  basket: { odss: 'basket', mercati: ['moneyline', 'ah', 'ou'] },
  pallavolo: { odss: 'volley', mercati: ['moneyline', 'ou'] },
};

const stessoNba = (a, b) => { const x = squadraNba(a); const y = squadraNba(b); return Boolean(x && y && x.abbr === y.abbr); };

// Linee della giocata ("Handicap -5.5", "Totale punti 221.5", "Handicap set -1.5", "Totale set 3.5"): si controlla
// la quota della linea giocata, non la linea principale del momento.
function lineeDellaVoce(v) {
  const h = /^Handicap (?:set )?([+-]?\d+(?:\.\d+)?)$/.exec(v.mercato);
  const t = /^Totale (?:punti|set) (\d+(?:\.\d+)?)$/.exec(v.mercato);
  return { ...(h ? { handicap: Number(h[1]) } : {}), ...(t ? { totale: Number(t[1]) } : {}) };
}

// Pallavolo come nella raccolta: nomi esatti del campionato, partite femminili solo ai campionati femminili, squadre
// riconosciute con lo storico TheSportsDB (data/storico/pallavolo-<id>.json). null se il campionato non si conosce.
function regolePallavolo(v, dirData) {
  const c = CAMPIONATI_PALLAVOLO.find((x) => x.competizione === v.competizione);
  if (!c) return null;
  let squadre = new Map();
  try { squadre = squadreStorico(leggiStorico(dirData, `pallavolo-${c.id}`).partite); } catch { /* storico illeggibile: nessun abbinamento */ }
  const id = (n) => abbinaSquadra(n, squadre);
  return {
    ammesso: (e) => legaAmmessa(e.campionato, c.legheOdss) && (!femminile(e) || /femminile/i.test(c.competizione)),
    stesso: (a, b) => Boolean(id(a)) && id(a) === id(b),
  };
}

// Evento abbinato alla voce e convertito nel formato dello sport (con i nostri nomi), o null.
function eventoPerVoce(v, eventi, dirData) {
  const sq = squadreDi(v.partita);
  const t = Date.parse(v.inizio);
  if (!sq || !Number.isFinite(t)) return null;
  const nostra = { id: v.id, casa: sq.casa, trasferta: sq.trasferta, inizio: v.inizio };
  const delloSport = eventi.filter((e) => e.sport === SPORT[v.sport].odss);
  if (v.sport === 'calcio') {
    const e = abbinaEventiOdss([{ idPartita: v.id, sport: 'calcio', ...nostra }], delloSport).get(v.id);
    return e ? { ...inFormatoCalcio(e), casa: sq.casa, trasferta: sq.trasferta } : null;
  }
  if (v.sport === 'tennis') {
    const m = abbinaEventi([nostra], delloSport.filter(tennisSingolare), { stesso: stessoGiocatore, invertibile: true }).get(v.id);
    if (!m) return null;
    return { giocatore1: sq.casa, giocatore2: sq.trasferta, casa: sq.casa, trasferta: sq.trasferta, inizio: v.inizio, bookmaker: inFormatoTennis(m.evento, sq.casa, sq.trasferta, { invertito: m.invertito }) };
  }
  const volley = v.sport === 'pallavolo' ? regolePallavolo(v, dirData) : null;
  if (v.sport === 'pallavolo' && !volley) return null;
  const stesso = v.sport === 'nba' ? stessoNba : v.sport === 'basket' ? (a, b) => stessaSquadra(a, b, 'basket') : volley.stesso;
  const candidati = v.sport === 'pallavolo' ? delloSport.filter(volley.ammesso) : delloSport.filter((e) => !femminile(e));
  const m = abbinaEventi([nostra], candidati, { stesso }).get(v.id);
  if (!m) return null;
  const linee = lineeDellaVoce(v);
  const opz = v.sport === 'pallavolo' ? { handicap: false, handicapSet: true, totali: (l) => l === 3.5, linee: { totale: linee.totale } } : { linee };
  return { casa: sq.casa, trasferta: sq.trasferta, inizio: v.inizio, bookmaker: inFormatoNba(m.evento, opz).bookmaker };
}

export async function quoteOdssControlli(voci, { chiave, dirData, data, adesso, fetch = globalThis.fetch, errore = () => {}, registra = () => {}, attesaMs = 2000 }) {
  const out = new Map();
  const conSport = voci.filter((v) => SPORT[v.sport] && Number.isFinite(Date.parse(v.inizio)));
  if (!conSport.length) return out;
  // Una riga per motivo per giornata: i controlli girano ogni 10 minuti e non devono ripetere la stessa riga.
  const budget = creaBudgetOdss({ stato: leggiStatoOdss(dirData), data, adesso, tipo: 'controlli' });
  let avvisato = false;
  const avvisa = (m) => { if (budget.avvisoNuovo(m.replace(/\d+([.,:]\d+)*/g, '#'))) { avvisato = true; errore('odss-api', m); } };
  if (!chiave) {
    avvisa('manca il secret ODSS_API_KEY: quote dei controlli dalle fonti di prima');
    if (avvisato) scriviStatoOdss(dirData, budget.stato());
    return out;
  }
  const cache = {};
  const idsVoce = new Map(conSport.map((v) => [v.id, idOdssVoce(v, dirData, data, cache)]));
  const conId = conSport.filter((v) => idsVoce.get(v.id).length);
  if (!conId.length) {
    if (avvisato) scriviStatoOdss(dirData, budget.stato());
    return out;
  }
  const sport = [...new Set(conId.map((v) => SPORT[v.sport].odss))];
  const mercati = [...new Set(conId.flatMap((v) => SPORT[v.sport].mercati))];
  const ids = [...new Set(conId.flatMap((v) => idsVoce.get(v.id)))];
  const righe = [];
  let richieste = 0;
  for (let i = 0; i < ids.length; i += CONFIG.odss.eventiPerRichiesta) {
    const r = await scaricaOdss({
      chiave, budget, sport: sport.join(','), gruppi: [mercati.join(',')], eventId: ids.slice(i, i + CONFIG.odss.eventiPerRichiesta).join(','),
      fetch, attesaMs, errore: avvisa, suffissoBudget: ': quote dei controlli dalle fonti di prima',
    });
    richieste += r.richieste;
    righe.push(...r.righe);
    if (r.fermo) break;
  }
  if (richieste || avvisato) scriviStatoOdss(dirData, budget.stato());
  if (!righe.length) return out;
  const perRegistro = new Map();
  for (const v of conId) {
    const mie = idsVoce.get(v.id);
    const delleVoce = mie.length > 1 ? unisciRigheEventi(righe, mie) : righe.filter((x) => String(x.event_id) === mie[0]);
    const e = eventoPerVoce(v, eventiDaRighe(delleVoce, { adesso }), dirData);
    if (!e) continue;
    const q = v.sport === 'calcio' ? quotaCalcio(e, v.mercato, v.selezione)
      : v.sport === 'tennis' ? quotaTennis(e, v.selezione) : quotaFormatoNba(e, v);
    if (!q || !num(q.quota)) continue;
    out.set(v.id, q);
    const k = `${v.sport}|${v.competizione}`;
    if (!perRegistro.has(k)) perRegistro.set(k, new Map());
    perRegistro.get(k).set(v.partita, e);
  }
  for (const [k, m] of perRegistro) {
    const i = k.indexOf('|');
    registra(k.slice(0, i), k.slice(i + 1), [...m.values()]);
  }
  return out;
}
