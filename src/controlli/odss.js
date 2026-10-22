// Quote dell'ultimo momento da odss-api per i controlli pre-partita [utente, 22/10/2026]: una sola richiesta per
// passaggio con tutti gli sport e i mercati delle voci da controllare, finestra da un'ora prima della prima partita a
// un'ora dopo l'ultima, tetto dei controlli del budget unico (CONFIG.odss.richiesteControlli al giorno, mai sotto la
// riserva). Map(id voce → { quota, n, prob }) solo per le voci con una quota: le altre (partita non trovata, mercato
// che odss non ha, budget finito, errore) restano alle fonti di prima.
import { creaBudgetOdss, leggiStatoOdss, scriviStatoOdss } from '../odss/budget.js';
import { scaricaOdss } from '../odss/scarica.js';
import { abbinaEventi, eventiDaRighe, femminile, inFormatoCalcio, inFormatoNba, inFormatoTennis, tennisSingolare } from '../odss/eventi.js';
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

// Evento abbinato alla voce e convertito nel formato dello sport (con i nostri nomi), o null.
function eventoPerVoce(v, eventi) {
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
  const stesso = v.sport === 'nba' ? stessoNba : v.sport === 'basket' ? (a, b) => stessaSquadra(a, b, 'basket') : (a, b) => stessaSquadra(a, b);
  const candidati = v.sport === 'pallavolo' ? delloSport : delloSport.filter((e) => !femminile(e));
  const m = abbinaEventi([nostra], candidati, { stesso }).get(v.id);
  if (!m) return null;
  const opz = v.sport === 'pallavolo' ? { handicap: false, handicapSet: true, totali: (l) => l === 3.5 } : {};
  return { casa: sq.casa, trasferta: sq.trasferta, inizio: v.inizio, bookmaker: inFormatoNba(m.evento, opz).bookmaker };
}

export async function quoteOdssControlli(voci, { chiave, dirData, data, adesso, fetch = globalThis.fetch, errore = () => {}, registra = () => {}, attesaMs = 2000 }) {
  const out = new Map();
  const conSport = voci.filter((v) => SPORT[v.sport] && Number.isFinite(Date.parse(v.inizio)));
  if (!conSport.length) return out;
  if (!chiave) { errore('odss-api', 'manca il secret ODSS_API_KEY: quote dei controlli dalle fonti di prima'); return out; }
  const sport = [...new Set(conSport.map((v) => SPORT[v.sport].odss))];
  const mercati = [...new Set(conSport.flatMap((v) => SPORT[v.sport].mercati))];
  const inizi = conSport.map((v) => Date.parse(v.inizio));
  const finestra = { da: iso(Math.min(...inizi) - ORA_MS), a: iso(Math.max(...inizi) + ORA_MS) };
  const budget = creaBudgetOdss({ stato: leggiStatoOdss(dirData), data, adesso, tipo: 'controlli' });
  const r = await scaricaOdss({
    chiave, budget, sport: sport.join(','), gruppi: [mercati.join(',')], finestra, fetch, attesaMs,
    errore: (m) => errore('odss-api', m), suffissoBudget: ': quote dei controlli dalle fonti di prima',
  });
  if (r.richieste) scriviStatoOdss(dirData, budget.stato());
  if (!r.righe.length) return out;
  const eventi = eventiDaRighe(r.righe, { adesso });
  const perRegistro = new Map();
  for (const v of conSport) {
    const e = eventoPerVoce(v, eventi);
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
