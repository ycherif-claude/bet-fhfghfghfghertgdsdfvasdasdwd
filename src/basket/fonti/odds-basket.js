// The Odds API per Eurolega e NBL: eventi (gratuiti) e quote h2h, spreads e totals (3 crediti),
// convertite nel formato dei bookmaker dell'NBA: { chiave, mercati: { vincente, handicap, totale } }.
import { scarica } from '../../calcio/fonti/http.js';

const BASE = 'https://api.the-odds-api.com/v4';
const FONTE = 'api.the-odds-api.com';

const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');
const numero = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const url = (percorso, parametri) => `${BASE}/${percorso}?${new URLSearchParams(parametri)}`;
const finestraParametri = (chiave, { da, a }) => ({ apiKey: chiave, commenceTimeFrom: iso(da), commenceTimeTo: iso(a) });

function json(testo) {
  try { return JSON.parse(testo); } catch { throw new Error(`${FONTE}: risposta non valida`); }
}

const crediti = (headers) => ({
  rimasti: numero(headers.get('x-requests-remaining')),
  usati: numero(headers.get('x-requests-used')),
});

const prezzo = (x) => (typeof x?.price === 'number' ? x.price : null);

// Mercati di un bookmaker. Handicap con la linea della casa (quella della trasferta dev'essere opposta),
// totale con la stessa linea per Over e Under: altrimenti il mercato si salta.
export function mercatiBookmaker(b, casa, trasferta) {
  const mercati = {};
  for (const m of b.markets ?? []) {
    const esiti = m.outcomes ?? [];
    const di = (nome) => esiti.find((o) => o.name === nome);
    if (m.key === 'h2h') {
      const c = prezzo(di(casa));
      const t = prezzo(di(trasferta));
      if (c !== null && t !== null) mercati.vincente = { casa: c, trasferta: t };
    } else if (m.key === 'spreads') {
      const c = di(casa);
      const t = di(trasferta);
      const linea = numero(c?.point);
      if (linea === null || numero(t?.point) !== -linea || prezzo(c) === null || prezzo(t) === null) continue;
      mercati.handicap = { [String(linea)]: { casa: prezzo(c), trasferta: prezzo(t) } };
    } else if (m.key === 'totals') {
      const o = di('Over');
      const u = di('Under');
      const linea = numero(o?.point);
      if (linea === null || numero(u?.point) !== linea || prezzo(o) === null || prezzo(u) === null) continue;
      mercati.totale = { [String(linea)]: { over: prezzo(o), under: prezzo(u) } };
    }
  }
  return mercati;
}

export const oddsBasket = {
  async eventi(chiaveCampionato, finestra, opz = {}) {
    const { chiave, ...resto } = opz;
    const r = await scarica(url(`sports/${chiaveCampionato}/events`, finestraParametri(chiave, finestra)), resto);
    const dati = json(r.testo);
    return {
      eventi: dati.map((e) => ({ id: e.id, casa: e.home_team, trasferta: e.away_team, inizio: e.commence_time })),
      rimasti: crediti(r.headers).rimasti,
    };
  },

  async quote(chiaveCampionato, finestra, opz = {}) {
    const { chiave, ...resto } = opz;
    const parametri = { ...finestraParametri(chiave, finestra), regions: 'eu', markets: 'h2h,spreads,totals', oddsFormat: 'decimal' };
    const r = await scarica(url(`sports/${chiaveCampionato}/odds`, parametri), resto);
    const dati = json(r.testo);
    const eventi = dati.map((e) => ({
      id: e.id,
      casa: e.home_team,
      trasferta: e.away_team,
      inizio: e.commence_time,
      bookmaker: (e.bookmakers ?? []).map((b) => ({ chiave: b.key, mercati: mercatiBookmaker(b, e.home_team, e.away_team) }))
        .filter((b) => Object.keys(b.mercati).length),
    }));
    return { eventi, ...crediti(r.headers) };
  },
};
