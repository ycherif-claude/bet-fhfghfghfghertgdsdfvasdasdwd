// Coppie a quota 2 [utente, 29/10/2026]: l'utente unisce due partite della multipla bonus per giocare
// una quota intorno a 2 ("raddoppio": una giocata sola, nessuna progressione). Le partite e le quote
// sono le stesse della multipla (gambePossibili): qui si formano solo le coppie.
// Due modi, tenuti entrambi in prova per confrontarli di settimana in settimana:
// - "margine" (quello mostrato): prima le coppie pagate meglio rispetto al giusto (quota × probabilità di Pinnacle);
// - "probabilita" (solo per confronto): prima le coppie più probabili secondo Pinnacle.
// Ogni partita entra in una sola coppia per modo: una partita andata storta non ne fa perdere due.
import { CONFIG } from '../config.js';

const C = CONFIG.coppieQuota2;
const EPS = 1e-9;
const arrotonda = (x) => Math.round(x * 100) / 100;

// Due modi in più, solo per confronto [utente, 29/10/2026], con la probabilità del nostro modello:
// - "modello": prima le coppie più probabili secondo il modello (solo partite che hanno il modello);
// - "confermate": come "margine", ma solo partite su cui modello e mercato sono d'accordo (entro `scarto`).
const resa = (a, b) => a.quota * a.probMercato * b.quota * b.probMercato;
export const CRITERI = Object.freeze({
  margine: resa,
  probabilita: (a, b) => a.probMercato * b.probMercato,
  modello: (a, b) => pm(a) * pm(b),
  confermate: resa,
  // Per probabilità, solo partite confermate da modello e mercato [utente, 31/10/2026] (mostrate).
  probabilitaConfermate: (a, b) => a.probMercato * b.probMercato,
  tutte: resa,
  probabilitaTutte: (a, b) => a.probMercato * b.probMercato,
  modelloTutte: (a, b) => pm(a) * pm(b),
  confermateTutte: resa,
});
const SIGLA = { margine: 'M', probabilita: 'P', modello: 'O', confermate: 'C', probabilitaConfermate: 'PC', tutte: 'T', probabilitaTutte: 'PT', modelloTutte: 'OT', confermateTutte: 'CT' };
// Probabilità del modello di una partita: quella corretta dalla taratura automatica, se c'è, altrimenti la grezza.
const numero = (v) => typeof v === 'number' && Number.isFinite(v);
export const pm = (g) => (numero(g.probModelloTarato) ? g.probModelloTarato : g.probModello);
const conModello = (g) => numero(pm(g));
export const confermata = (g) => conModello(g) && Math.abs(pm(g) - g.probMercato) < C.scartoConferma + EPS;

// Coppie del giorno con `criterio` dalle gambe di gambePossibili (con quota e probMercato).
export function costruisciCoppie(gambe, { data, criterio = 'margine' } = {}) {
  const punteggio = CRITERI[criterio];
  if (!punteggio) throw new Error(`Criterio delle coppie non valido: ${criterio}`);
  const altro = CRITERI[['probabilita', 'modello', 'probabilitaTutte', 'modelloTutte', 'probabilitaConfermate'].includes(criterio) ? 'margine' : 'probabilita'];
  const possibili = [];
  for (let i = 0; i < gambe.length; i++) {
    for (let j = i + 1; j < gambe.length; j++) {
      const a = gambe[i];
      const b = gambe[j];
      if (a.idPartita === b.idPartita) continue;
      const quota = a.quota * b.quota;
      if (quota < C.quotaMin - EPS || quota > C.quotaMax + EPS) continue;
      possibili.push({ a, b, quota, p: punteggio(a, b), q: altro(a, b), chiave: [a.idPartita, b.idPartita].sort().join('|') });
    }
  }
  possibili.sort((x, y) => y.p - x.p || y.q - x.q || x.chiave.localeCompare(y.chiave));
  const usate = new Set();
  const out = [];
  for (const c of possibili) {
    if (usate.has(c.a.idPartita) || usate.has(c.b.idPartita)) continue;
    usate.add(c.a.idPartita);
    usate.add(c.b.idPartita);
    const prob = c.a.probMercato * c.b.probMercato;
    out.push({
      id: `Q2${SIGLA[criterio]}${out.length + 1}-${data}`,
      criterio,
      prova: true,
      gambe: [c.a, c.b].sort((x, y) => Date.parse(x.inizio) - Date.parse(y.inizio)).map(({ resa, ...g }) => ({ ...g, esito: null })),
      quota: arrotonda(c.quota),
      prob,
      probModello: conModello(c.a) && conModello(c.b) ? pm(c.a) * pm(c.b) : null,
      valueAtteso: prob * c.quota - 1,
      esito: null,
      ritorno: null,
    });
  }
  return out;
}

// Solo le migliori `C.migliori` partite del giorno per margine [utente, 30/10/2026]: dal 23 al 29/10 le coppie
// dalle prime 20 hanno vinto il 63%, quelle da tutte le partite il 52% (le ultime dell'elenco vincono meno).
export const migliori = (gambe) => [...gambe].sort((a, b) => b.quota * b.probMercato - a.quota * a.probMercato).slice(0, C.migliori);

// Le coppie degli otto modi (si mostrano solo quelle per margine). I primi quattro sulle migliori partite; gli altri
// quattro uguali ma con tutte le partite adatte, per confronto ("tutte" è il margine) [utente, 30/10/2026].
export const MODI = Object.freeze(['margine', 'probabilita', 'modello', 'confermate', 'probabilitaConfermate', 'tutte', 'probabilitaTutte', 'modelloTutte', 'confermateTutte']);
export const costruisciCoppieQuota2 = (gambe, { data } = {}) => {
  const top = migliori(gambe);
  return {
    margine: costruisciCoppie(top, { data, criterio: 'margine' }),
    probabilita: costruisciCoppie(top, { data, criterio: 'probabilita' }),
    modello: costruisciCoppie(top.filter(conModello), { data, criterio: 'modello' }),
    confermate: costruisciCoppie(top.filter(confermata), { data, criterio: 'confermate' }),
    probabilitaConfermate: costruisciCoppie(top.filter(confermata), { data, criterio: 'probabilitaConfermate' }),
    tutte: costruisciCoppie(gambe, { data, criterio: 'tutte' }),
    probabilitaTutte: costruisciCoppie(gambe, { data, criterio: 'probabilitaTutte' }),
    modelloTutte: costruisciCoppie(gambe.filter(conModello), { data, criterio: 'modelloTutte' }),
    confermateTutte: costruisciCoppie(gambe.filter(confermata), { data, criterio: 'confermateTutte' }),
  };
};
// Tutte le coppie di una giornata, di qualunque modo.
export const tutteLeCoppie = (giornata) => Object.values(giornata?.coppieQuota2 ?? {}).flatMap((l) => (Array.isArray(l) ? l : []));

// Esito con gli esiti delle due partite: una persa → persa; una aperta → null; una rimborsata esce e resta
// la quota dell'altra (regola bet365). `ritorno`: euro per 1 € puntato.
export function esitoCoppia(c) {
  const esiti = c.gambe.map((g) => g.esito);
  if (esiti.includes('persa')) return { esito: 'persa', ritorno: 0 };
  if (esiti.some((e) => e !== 'vinta' && e !== 'rimborsata')) return { esito: null, ritorno: null };
  const vinte = c.gambe.filter((g) => g.esito === 'vinta');
  if (!vinte.length) return { esito: 'rimborsata', ritorno: 1 };
  return { esito: 'vinta', ritorno: arrotonda(vinte.reduce((a, g) => a * g.quota, 1)) };
}

// Bilancio delle coppie chiuse di un modo su più giornate: 1 € a coppia.
export function bilancioCoppie(giornate, criterio) {
  const r = { chiuse: 0, vinte: 0, perse: 0, rimborsate: 0, aperte: 0, profitto: 0 };
  for (const g of giornate) {
    for (const c of g?.coppieQuota2?.[criterio] ?? []) {
      if (c.esito === 'vinta') { r.chiuse++; r.vinte++; r.profitto += c.ritorno - 1; }
      else if (c.esito === 'persa') { r.chiuse++; r.perse++; r.profitto -= 1; }
      else if (c.esito === 'rimborsata') { r.chiuse++; r.rimborsate++; }
      else r.aperte++;
    }
  }
  r.profitto = arrotonda(r.profitto);
  return r;
}
