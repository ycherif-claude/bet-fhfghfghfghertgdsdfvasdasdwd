import { scarica } from '../../calcio/fonti/http.js';
import { isoRoma } from '../../calcio/testo.js';
import { squadraNba } from '../squadre.js';

const BASE = 'https://api.sportsgameodds.com/v2/events';

const ODD = {
  mlCasa: 'points-home-game-ml-home',
  mlTrasferta: 'points-away-game-ml-away',
  spCasa: 'points-home-game-sp-home',
  spTrasferta: 'points-away-game-sp-away',
  over: 'points-all-game-ou-over',
  under: 'points-all-game-ou-under',
};

function json(testo) {
  try { return JSON.parse(testo); } catch { throw new Error('api.sportsgameodds.com: risposta non valida'); }
}

const num = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Quota americana (stringa o numero) in decimale, arrotondata a 2 decimali.
export function americanaInDecimale(v) {
  const a = num(typeof v === 'string' ? v.replace(/^\+/, '') : v);
  if (a === null || a === 0) return null;
  const d = a > 0 ? 1 + a / 100 : 1 + 100 / -a;
  return Math.round(d * 100) / 100;
}

// Quota di un bookmaker per un oddID, se disponibile.
function voce(evento, oddID, bk) {
  const b = evento.odds?.[oddID]?.byBookmaker?.[bk];
  if (!b || b.available === false) return null;
  const quota = americanaInDecimale(b.odds);
  if (quota === null) return null;
  return { quota, linea: num(b.spread ?? b.overUnder) };
}

function mercati(evento, bk) {
  const m = {};
  const mc = voce(evento, ODD.mlCasa, bk);
  const mt = voce(evento, ODD.mlTrasferta, bk);
  if (mc && mt) m.vincente = { casa: mc.quota, trasferta: mt.quota };

  const sc = voce(evento, ODD.spCasa, bk);
  const st = voce(evento, ODD.spTrasferta, bk);
  if (sc && st && sc.linea !== null && st.linea !== null && sc.linea === -st.linea) {
    m.handicap = { [String(sc.linea)]: { casa: sc.quota, trasferta: st.quota } };
  }

  const o = voce(evento, ODD.over, bk);
  const u = voce(evento, ODD.under, bk);
  if (o && u && o.linea !== null && o.linea === u.linea) {
    m.totale = { [String(o.linea)]: { over: o.quota, under: u.quota } };
  }
  return m;
}

function chiaviBookmaker(evento) {
  const s = new Set();
  for (const odd of Object.values(evento.odds ?? {})) for (const k of Object.keys(odd?.byBookmaker ?? {})) s.add(k);
  return [...s];
}

export const sportsgameodds = {
  // Eventi NBA con quote. Nomi: teams.{home,away}.names.long (nome completo),
  // mappato con squadraNba. Scartati gli eventi con squadre sconosciute: i
  // nomi stanno nella proprietà non enumerabile `nonRiconosciute`.
  async eventi({ da, a }, opz = {}) {
    const { chiave, ...resto } = opz;
    const out = [];
    const nonRiconosciute = [];
    let cursore = null;
    do {
      const q = new URLSearchParams({
        apiKey: chiave ?? '', leagueID: 'NBA', oddsAvailable: 'true',
        startsAfter: new Date(da).toISOString(), startsBefore: new Date(a).toISOString(),
      });
      if (cursore) q.set('cursor', cursore);
      const r = await scarica(`${BASE}?${q}`, resto);
      const corpo = json(r.testo);
      for (const e of corpo.data ?? []) {
        const nc = e.teams?.home?.names?.long ?? e.teams?.home?.names?.medium;
        const nt = e.teams?.away?.names?.long ?? e.teams?.away?.names?.medium;
        const casa = squadraNba(nc);
        const trasferta = squadraNba(nt);
        if (!casa || !trasferta) { nonRiconosciute.push(String(!casa ? nc : nt)); continue; }
        const bookmaker = chiaviBookmaker(e)
          .map((chiave) => ({ chiave, mercati: mercati(e, chiave) }))
          .filter((b) => Object.keys(b.mercati).length);
        out.push({
          id: e.eventID, casa: casa.nome, trasferta: trasferta.nome,
          inizio: e.status?.startsAt ? isoRoma(new Date(e.status.startsAt)) : null,
          bookmaker,
        });
      }
      cursore = corpo.nextCursor || null;
    } while (cursore);
    Object.defineProperty(out, 'nonRiconosciute', { value: nonRiconosciute, enumerable: false });
    return out;
  },
};
