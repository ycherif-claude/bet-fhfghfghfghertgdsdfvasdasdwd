import { scarica } from './http.js';
import { leggiCsv } from '../csv.js';

const AGENTE = 'analisi-giocate (progetto personale)';

const numero = (v) => (v === undefined || v === null || String(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// gg/mm/aaaa (o gg/mm/aa) -> AAAA-MM-GG
function dataIso(testo) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(testo).trim());
  if (!m) return null;
  const anno = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${anno}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function somma(a, b) {
  const x = numero(a);
  const y = numero(b);
  if (x === null && y === null) return null;
  return (x ?? 0) + (y ?? 0);
}

function converti(r) {
  const gc = numero(r.FTHG);
  const gt = numero(r.FTAG);
  const data = dataIso(r.Date);
  if (gc === null || gt === null || !data) return null;
  return {
    data,
    casa: r.HomeTeam,
    trasferta: r.AwayTeam,
    gc,
    gt,
    gcPT: numero(r.HTHG),
    gtPT: numero(r.HTAG),
    xgC: numero(r.HxG),
    xgT: numero(r.AxG),
    angoliC: numero(r.HC),
    angoliT: numero(r.AC),
    cartC: somma(r.HY, r.HR),
    cartT: somma(r.AY, r.AR),
    arbitro: r.Referee ? r.Referee : null,
  };
}

// Quote del CSV per la prova sul passato (src/taratura): Pinnacle prima della partita e in chiusura,
// media e massimo dei bookmaker, per 1X2 e Under/Over 2.5. Ogni terna o coppia incompleta resta null.
export function quoteFootballData(r) {
  const gruppo = (...chiavi) => {
    const v = chiavi.map((k) => numero(r[k]));
    return v.every((x) => x !== null && x > 1) ? v : null;
  };
  return {
    pinnacle1x2: gruppo('PSH', 'PSD', 'PSA'),
    pinnacleChiusura1x2: gruppo('PSCH', 'PSCD', 'PSCA'),
    media1x2: gruppo('AvgH', 'AvgD', 'AvgA'),
    max1x2: gruppo('MaxH', 'MaxD', 'MaxA'),
    pinnacleOU: gruppo('P>2.5', 'P<2.5'),
    pinnacleChiusuraOU: gruppo('PC>2.5', 'PC<2.5'),
    mediaOU: gruppo('Avg>2.5', 'Avg<2.5'),
    maxOU: gruppo('Max>2.5', 'Max<2.5'),
    // Bookmaker con licenza ADM presenti in tutte le stagioni: bet365 e bwin.
    bet3651x2: gruppo('B365H', 'B365D', 'B365A'),
    bwin1x2: gruppo('BWH', 'BWD', 'BWA'),
    bet365OU: gruppo('B365>2.5', 'B365<2.5'),
  };
}

// Tiri e tiri in porta (per la prova sul passato).
export function tiriFootballData(r) {
  return { tiriC: numero(r.HS), tiriT: numero(r.AS), tiriPortaC: numero(r.HST), tiriPortaT: numero(r.AST) };
}

export { converti as partitaFootballData };

export const footballDataUk = {
  async partite(codice, stagioni, opz = {}) {
    const { chiave, ...resto } = opz;
    const out = [];
    for (const stagione of stagioni) {
      const r = await scarica(`https://www.football-data.co.uk/mmz4281/${stagione}/${codice}.csv`,
        { ...resto, headers: { 'User-Agent': AGENTE } });
      for (const riga of leggiCsv(r.testo)) {
        const p = converti(riga);
        if (p) out.push(p);
      }
    }
    return out;
  },
};
