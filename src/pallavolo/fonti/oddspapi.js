// OddsPapi (piano gratuito, chiave `apiKey`): palinsesto della pallavolo, quote di una partita
// e conteggio delle richieste. Ogni chiamata a /fixtures e /odds conta 1 richiesta; /account è gratuito.
import { scarica } from '../../calcio/fonti/http.js';

const BASE = 'https://api.oddspapi.io/v4';
const FONTE = 'api.oddspapi.io';
export const SPORT_PALLAVOLO = 23;

// Mercati e esiti di OddsPapi per la pallavolo (collaudo del 21/10/2026): esito "1" = casa, "2" = trasferta.
// Handicap riferito alla casa (participant1).
// Stesso formato dei bookmaker dell'NBA: vincente, handicap e totale per linea.
const MERCATI = [
  { tipo: 'vincente', linea: null, mercato: '231', a: ['231', 'casa'], b: ['232', 'trasferta'] },
  { tipo: 'handicap', linea: -1.5, mercato: '2323', a: ['2323', 'casa'], b: ['2324', 'trasferta'] },
  { tipo: 'handicap', linea: 1.5, mercato: '2335', a: ['2335', 'casa'], b: ['2336', 'trasferta'] },
  { tipo: 'totale', linea: 3.5, mercato: '2313', a: ['2313', 'over'], b: ['2314', 'under'] },
];
// Exchange e mercati di previsione: niente mediana né consenso.
const ESCLUSI = /betfair|matchbook|smarkets|exchange|polymarket|kalshi|novig|prophetx|sporttrade/;

const url = (percorso, parametri) => `${BASE}/${percorso}?${new URLSearchParams(parametri)}`;
const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');

function json(testo) {
  try { return JSON.parse(testo); } catch { throw new Error(`${FONTE}: risposta non valida`); }
}

const prezzo = (esito) => {
  const p = Object.values(esito?.players ?? {})[0];
  return p && p.active !== false && typeof p.price === 'number' && p.price > 1 ? p.price : null;
};

// Stesso bookmaker con domini diversi (bet365, bet365.de, bet365-nj): conta una volta, preferendo il nome base.
const base = (chiave) => String(chiave).split(/[.-]/)[0];

// Quote di una risposta /odds: [{ chiave, mercati: { vincente: { casa, trasferta },
// handicap: { '-1.5': { casa, trasferta }, '1.5': … }, totale: { '3.5': { over, under } } } }].
export function leggiQuote(risposta) {
  const perBase = new Map();
  for (const [chiave, b] of Object.entries(risposta?.bookmakerOdds ?? {})) {
    if (ESCLUSI.test(chiave) || b?.bookmakerIsActive === false || b?.suspended) continue;
    const mercati = {};
    for (const def of MERCATI) {
      const m = b.markets?.[def.mercato];
      if (!m || m.marketActive === false) continue;
      const qa = prezzo(m.outcomes?.[def.a[0]]);
      const qb = prezzo(m.outcomes?.[def.b[0]]);
      if (qa === null || qb === null) continue;
      const coppia = { [def.a[1]]: qa, [def.b[1]]: qb };
      if (def.linea === null) mercati[def.tipo] = coppia;
      else mercati[def.tipo] = { ...(mercati[def.tipo] ?? {}), [String(def.linea)]: coppia };
    }
    if (!Object.keys(mercati).length) continue;
    const k = base(chiave);
    if (!perBase.has(k) || chiave === k) perBase.set(k, { chiave: k, mercati });
  }
  return [...perBase.values()];
}

export const oddspapi = {
  // Gratuito: { limite, usate } del mese, null se l'API non le dice.
  async conto(opz = {}) {
    const { chiave, ...resto } = opz;
    const r = await scarica(url('account', { apiKey: chiave }), resto);
    const j = json(r.testo);
    const trova = (o, k) => {
      if (!o || typeof o !== 'object') return undefined;
      if (typeof o[k] === 'number') return o[k];
      for (const v of Object.values(o)) { const x = trova(v, k); if (x !== undefined) return x; }
      return undefined;
    };
    const limite = trova(j, 'request_limit');
    const usate = trova(j, 'request_count');
    return typeof limite === 'number' && typeof usate === 'number' ? { limite, usate } : null;
  },

  // 1 richiesta: tutte le partite di pallavolo con quote nella finestra (meno di 48 ore).
  async partite(finestra, opz = {}) {
    const { chiave, ...resto } = opz;
    const r = await scarica(url('fixtures', {
      sportId: SPORT_PALLAVOLO, from: iso(finestra.da), to: iso(finestra.a), hasOdds: 'true', apiKey: chiave,
    }), resto);
    return json(r.testo).map((f) => ({
      id: f.fixtureId, torneo: f.tournamentId, casa: f.participant1Name, trasferta: f.participant2Name,
      inizio: f.startTime, stato: f.statusId,
    }));
  },

  // 1 richiesta: le quote di una partita, di tutti i bookmaker.
  async quote(idPartita, opz = {}) {
    const { chiave, ...resto } = opz;
    const r = await scarica(url('odds', { fixtureId: idPartita, oddsFormat: 'decimal', apiKey: chiave }), resto);
    return leggiQuote(json(r.testo));
  },
};
