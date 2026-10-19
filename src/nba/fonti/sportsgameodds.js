import { scarica } from '../../calcio/fonti/http.js';
import { isoRoma } from '../../calcio/testo.js';
import { squadraNba } from '../squadre.js';

const BASE = 'https://api.sportsgameodds.com/v2/events';
const MAX_PAGINE = 50;

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
// Ritorna null se non convertibile (es. "EVEN", testo, 0).
export function americanaInDecimale(v) {
  const a = num(typeof v === 'string' ? v.replace(/^\+/, '') : v);
  if (a === null || a === 0) return null;
  const d = a > 0 ? 1 + a / 100 : 1 + 100 / -a;
  return Math.round(d * 100) / 100;
}

// Voce di un bookmaker per un oddID: null se assente o non disponibile.
// `campoLinea` e il campo della linea giusto per il mercato ('spread' per sp,
// 'overUnder' per ou), senza mai ripiegare sull'altro.
// DA VERIFICARE sulla prima risposta reale (collaudo, Task 9): che byBookmaker
// contenga davvero `spread` e `overUnder`; la documentazione non lo conferma.
function voce(evento, oddID, bk, campoLinea) {
  const b = evento.odds?.[oddID]?.byBookmaker?.[bk];
  if (!b || b.available === false) return null;
  return { quota: americanaInDecimale(b.odds), linea: campoLinea ? num(b[campoLinea]) : null };
}

function mercati(evento, bk, diag) {
  const m = {};
  // Conta le quote non convertibili; vero se la coppia e utilizzabile.
  const coppiaOk = (x, y) => {
    let ok = true;
    for (const v of [x, y]) if (v.quota === null) { diag.quoteNonConvertibili++; ok = false; }
    return ok;
  };

  const mc = voce(evento, ODD.mlCasa, bk);
  const mt = voce(evento, ODD.mlTrasferta, bk);
  if (mc && mt && coppiaOk(mc, mt)) m.vincente = { casa: mc.quota, trasferta: mt.quota };

  const sc = voce(evento, ODD.spCasa, bk, 'spread');
  const st = voce(evento, ODD.spTrasferta, bk, 'spread');
  if (sc && st && coppiaOk(sc, st)) {
    if (sc.linea === null || st.linea === null) diag.lineaMancante.handicap++;
    else if (sc.linea !== -st.linea) diag.handicapAsimmetrico++;
    else m.handicap = { [String(sc.linea)]: { casa: sc.quota, trasferta: st.quota } };
  }

  const o = voce(evento, ODD.over, bk, 'overUnder');
  const u = voce(evento, ODD.under, bk, 'overUnder');
  if (o && u && coppiaOk(o, u)) {
    if (o.linea === null || u.linea === null) diag.lineaMancante.totale++;
    else if (o.linea === u.linea) m.totale = { [String(o.linea)]: { over: o.quota, under: u.quota } };
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
  // mappato con squadraNba. Eventi con squadre sconosciute scartati: i nomi
  // stanno nella proprieta non enumerabile `nonRiconosciute`; i mercati persi
  // sono contati nella non enumerabile `diagnostica`.
  async eventi({ da, a }, opz = {}) {
    const { chiave, ...resto } = opz;
    const out = [];
    const nonRiconosciute = [];
    const diag = { lineaMancante: { handicap: 0, totale: 0 }, quoteNonConvertibili: 0, handicapAsimmetrico: 0 };
    const visti = new Set();
    let cursore = null;
    do {
      if (visti.size >= MAX_PAGINE) throw new Error(`api.sportsgameodds.com: oltre ${MAX_PAGINE} pagine`);
      visti.add(cursore ?? '');
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
        if (!casa || !trasferta) {
          if (!casa) nonRiconosciute.push(String(nc));
          if (!trasferta) nonRiconosciute.push(String(nt));
          continue;
        }
        const bookmaker = chiaviBookmaker(e)
          .map((k) => ({ chiave: k, mercati: mercati(e, k, diag) }))
          .filter((b) => Object.keys(b.mercati).length);
        out.push({
          id: e.eventID, casa: casa.nome, trasferta: trasferta.nome,
          inizio: e.status?.startsAt ? isoRoma(new Date(e.status.startsAt)) : null,
          bookmaker,
        });
      }
      cursore = corpo.nextCursor || null;
      if (cursore && visti.has(cursore)) throw new Error('api.sportsgameodds.com: cursore ripetuto');
    } while (cursore);
    Object.defineProperty(out, 'nonRiconosciute', { value: nonRiconosciute, enumerable: false });
    Object.defineProperty(out, 'diagnostica', { value: diag, enumerable: false });
    return out;
  },
};
