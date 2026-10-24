// Quote dell'ultimo momento da odss-api per i controlli pre-partita [utente, 22/10/2026]: una sola richiesta per
// passaggio con tutti gli sport e i mercati delle voci da controllare, finestra da un'ora prima della prima partita a
// un'ora dopo l'ultima, tetto dei controlli del budget unico (CONFIG.odss.tetti.controlli al giorno, mai sotto la
// riserva). Map(id voce → { quota, n, prob }) solo per le voci con una quota: le altre (partita non trovata, mercato
// che odss non ha, budget finito, errore) restano alle fonti di prima.
import { creaBudgetOdss, leggiStatoOdss, scriviStatoOdss } from '../odss/budget.js';
import { scaricaOdss } from '../odss/scarica.js';
import { abbinaEventi, eventiDaRighe, femminile, inFormatoCalcio, inFormatoNba, inFormatoTennis, legaAmmessa, tennisSingolare } from '../odss/eventi.js';
import { CAMPIONATI_PALLAVOLO } from '../pallavolo/campionati.js';
import { abbinaSquadra, squadreStorico } from '../pallavolo/squadre.js';
import { leggiStorico } from '../basket/storico.js';
import { abbinaEventiOdss } from '../calcio/odss.js';
import { stessoGiocatore } from '../tennis/raccolta.js';
import { squadraNba } from '../nba/squadre.js';
import { stessaSquadra } from './espn.js';
import { quotaCalcio, quotaFormatoNba, quotaTennis, squadreDi } from './quote.js';

const ORA_MS = 3600000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const iso = (t) => new Date(t);

// Sport delle voci → sport e mercati di odss-api.
const SPORT = {
  calcio: { odss: 'calcio', mercati: ['1x2', 'ou'] },
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
  const sport = [...new Set(conSport.map((v) => SPORT[v.sport].odss))];
  const mercati = [...new Set(conSport.flatMap((v) => SPORT[v.sport].mercati))];
  const inizi = conSport.map((v) => Date.parse(v.inizio));
  const finestra = { da: iso(Math.min(...inizi) - ORA_MS), a: iso(Math.max(...inizi) + ORA_MS) };
  const r = await scaricaOdss({
    chiave, budget, sport: sport.join(','), gruppi: [mercati.join(',')], finestra, fetch, attesaMs,
    errore: avvisa, suffissoBudget: ': quote dei controlli dalle fonti di prima',
  });
  if (r.richieste || avvisato) scriviStatoOdss(dirData, budget.stato());
  if (!r.righe.length) return out;
  const eventi = eventiDaRighe(r.righe, { adesso });
  const perRegistro = new Map();
  for (const v of conSport) {
    const e = eventoPerVoce(v, eventi, dirData);
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
