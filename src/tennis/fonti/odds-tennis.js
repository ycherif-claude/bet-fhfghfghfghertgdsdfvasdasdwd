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

function quoteBookmaker(b, g1, g2) {
  const m = (b.markets ?? []).find((x) => x.key === 'h2h');
  if (!m) return null;
  const prezzo = (nome) => (m.outcomes ?? []).find((o) => o.name === nome)?.price;
  const p1 = prezzo(g1);
  const p2 = prezzo(g2);
  if (typeof p1 !== 'number' || typeof p2 !== 'number') return null;
  return { chiave: b.key, aggiornato: b.last_update, quote: { [g1]: p1, [g2]: p2 } };
}

export const oddsTennis = {
  async torneiAttivi(opz = {}) {
    const { chiave, ...resto } = opz;
    const r = await scarica(url('sports', { apiKey: chiave }), resto);
    const dati = json(r.testo);
    const out = [];
    for (const s of dati) {
      const m = /^tennis_(atp|wta)_/.exec(s.key ?? '');
      if (!m || s.active !== true) continue;
      out.push({ chiave: s.key, titolo: s.title, circuito: m[1] });
    }
    return out;
  },

  async eventi(chiaveTorneo, finestra, opz = {}) {
    const { chiave, ...resto } = opz;
    const r = await scarica(url(`sports/${chiaveTorneo}/events`, finestraParametri(chiave, finestra)), resto);
    const dati = json(r.testo);
    return {
      eventi: dati.map((e) => ({ id: e.id, giocatore1: e.home_team, giocatore2: e.away_team, inizio: e.commence_time })),
      rimasti: crediti(r.headers).rimasti,
    };
  },

  async quote(chiaveTorneo, finestra, opz = {}) {
    const { chiave, ...resto } = opz;
    const parametri = { ...finestraParametri(chiave, finestra), regions: 'eu', markets: 'h2h', oddsFormat: 'decimal' };
    const r = await scarica(url(`sports/${chiaveTorneo}/odds`, parametri), resto);
    const dati = json(r.testo);
    const eventi = dati.map((e) => ({
      id: e.id,
      giocatore1: e.home_team,
      giocatore2: e.away_team,
      inizio: e.commence_time,
      bookmaker: (e.bookmakers ?? []).map((b) => quoteBookmaker(b, e.home_team, e.away_team)).filter(Boolean),
    }));
    return { eventi, ...crediti(r.headers) };
  },

  async risultati(chiaveTorneo, opz = {}) {
    const { chiave, ...resto } = opz;
    const r = await scarica(url(`sports/${chiaveTorneo}/scores`, { apiKey: chiave, daysFrom: 3 }), resto);
    const dati = json(r.testo);
    const out = [];
    for (const e of dati) {
      if (!e.completed || !Array.isArray(e.scores)) continue;
      const s1 = numero(e.scores.find((s) => s.name === e.home_team)?.score);
      const s2 = numero(e.scores.find((s) => s.name === e.away_team)?.score);
      if (s1 === null || s2 === null || s1 === s2) continue;
      out.push({
        giocatore1: e.home_team, giocatore2: e.away_team, inizio: e.commence_time,
        set1: s1, set2: s2, vincitore: s1 > s2 ? e.home_team : e.away_team, fonte: 'the-odds-api',
      });
    }
    return out;
  },
};
