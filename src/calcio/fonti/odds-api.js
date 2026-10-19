import { scarica } from './http.js';

const BASE = 'https://api.the-odds-api.com/v4';

// ISO UTC senza millisecondi, come richiede The Odds API.
const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');

const numero = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function url(sport, percorso, parametri) {
  const q = new URLSearchParams(parametri);
  return `${BASE}/sports/${sport}/${percorso}?${q}`;
}

function finestraParametri(chiave, { da, a }) {
  return { apiKey: chiave, commenceTimeFrom: iso(da), commenceTimeTo: iso(a) };
}

function json(testo, fonte) {
  try { return JSON.parse(testo); } catch { throw new Error(`${fonte}: risposta non valida`); }
}

const crediti = (headers) => ({
  rimasti: numero(headers.get('x-requests-remaining')),
  usati: numero(headers.get('x-requests-used')),
});

function mercatiBookmaker(b, casa, trasferta) {
  const mercati = {};
  for (const m of b.markets ?? []) {
    if (m.key === 'h2h') {
      const prezzo = (nome) => (m.outcomes ?? []).find((o) => o.name === nome)?.price;
      const h = { casa: prezzo(casa), pareggio: prezzo('Draw'), trasferta: prezzo(trasferta) };
      if (Object.values(h).every((x) => typeof x === 'number')) mercati.h2h = h;
    } else if (m.key === 'totals') {
      const totals = {};
      for (const o of m.outcomes ?? []) {
        if (o.point === undefined || o.point === null) continue;
        const riga = (totals[String(o.point)] ??= {});
        if (o.name === 'Over') riga.over = o.price;
        else if (o.name === 'Under') riga.under = o.price;
      }
      for (const [linea, r] of Object.entries(totals)) {
        if (typeof r.over !== 'number' || typeof r.under !== 'number') delete totals[linea];
      }
      if (Object.keys(totals).length) mercati.totals = totals;
    }
  }
  return mercati;
}

export const oddsApi = {
  async eventi(sport, finestra, opz = {}) {
    const { chiave, ...resto } = opz;
    const r = await scarica(url(sport, 'events', finestraParametri(chiave, finestra)), resto);
    const dati = json(r.testo, 'api.the-odds-api.com');
    return {
      eventi: dati.map((e) => ({ id: e.id, casa: e.home_team, trasferta: e.away_team, inizio: e.commence_time })),
      rimasti: crediti(r.headers).rimasti,
    };
  },

  async quote(sport, finestra, opz = {}) {
    const { chiave, ...resto } = opz;
    const parametri = { ...finestraParametri(chiave, finestra), regions: 'eu', markets: 'h2h,totals', oddsFormat: 'decimal' };
    const r = await scarica(url(sport, 'odds', parametri), resto);
    const dati = json(r.testo, 'api.the-odds-api.com');
    const eventi = dati.map((e) => ({
      id: e.id,
      casa: e.home_team,
      trasferta: e.away_team,
      inizio: e.commence_time,
      bookmaker: (e.bookmakers ?? []).map((b) => ({
        chiave: b.key,
        aggiornato: b.last_update,
        mercati: mercatiBookmaker(b, e.home_team, e.away_team),
      })),
    }));
    return { eventi, ...crediti(r.headers) };
  },

  async risultati(sport, opz = {}) {
    const { chiave, ...resto } = opz;
    const r = await scarica(url(sport, 'scores', { apiKey: chiave, daysFrom: 3 }), resto);
    const dati = json(r.testo, 'api.the-odds-api.com');
    const out = [];
    for (const e of dati) {
      if (!e.completed || !Array.isArray(e.scores)) continue;
      const gc = numero(e.scores.find((s) => s.name === e.home_team)?.score);
      const gt = numero(e.scores.find((s) => s.name === e.away_team)?.score);
      if (gc === null || gt === null) continue;
      out.push({ casa: e.home_team, trasferta: e.away_team, inizio: e.commence_time, gc, gt, gcPT: null, gtPT: null, fonte: 'the-odds-api' });
    }
    return out;
  },
};
