// Multiple bonus bet365: il vantaggio viene dall'incremento sulla vincita, non dal modello.
// Prova sul passato (22/10/2026): le favorite di bet365 a 1,25–1,50 perdono circa il 2,3% a partita;
// con l'incremento la multipla da 10 rende circa +7%, quella da 20 circa +26% (con molta varianza).
import { CONFIG } from '../config.js';

const C = CONFIG.multiplaBonus;
const EPS = 1e-9;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// Incremento bet365 per numero di selezioni (da 20 in su il massimo).
export function incremento(n) {
  if (n < 2) return 0;
  return C.incremento[Math.min(n, 20)] ?? 0;
}

// Mercati ammessi: niente esiti che possono finire rimborsati (handicap asiatico a linea intera,
// linee intere, tennis con il ritiro prima dell'inizio [correzione C1]) e niente cartellini o angoli
// (esiti da ESPN solo provvisori).
export function mercatoAmmesso(mercato, selezione, sport = null) {
  if (typeof mercato !== 'string') return false;
  if (sport === 'tennis' || mercato === 'Vincente incontro') return false;
  if (/^(Angoli|Cartellini|Risultato esatto)/.test(mercato)) return false;
  const linea = /([+-]?\d+(?:\.\d+)?)\s*$/.exec(mercato)?.[1] ?? /([+-]?\d+(?:\.\d+)?)\s*$/.exec(String(selezione))?.[1];
  if (/Handicap|Under\/Over|Totale/.test(mercato) && linea !== undefined && Number.isInteger(Number(linea))) return false;
  return true;
}

// Gambe possibili da `voci` (valutaMercati): quota nel range, probabilità equa del mercato nota,
// partita non esclusa. Per partita la selezione con il margine più basso (quota × probabilità equa più alta).
// Quota per bet365 [correzione C1]: con la quota bet365 questa deve essere ≥ quotaMinBet365; senza, la
// mediana deve essere ≥ quotaMinMediana (bet365 di solito paga un po' meno della mediana).
const quotaBet365Ok = (m) => (num(m.quotaBet365) ? m.quotaBet365 >= C.quotaMinBet365 - EPS : m.quota >= C.quotaMinMediana - EPS);

// `senzaUnder` [utente, 29/10/2026]: niente Under 2.5 e 3.5 (coppie e multiple per probabilità); la partita
// resta con la sua selezione migliore fra le altre.
export function gambePossibili(voci, { escluse = new Set(), senzaUnder = false } = {}) {
  const migliori = new Map();
  for (const { partita, m } of voci) {
    if (escluse.has(partita.idPartita) || C.competizioniEscluse.includes(partita.competizione)) continue;
    if (senzaUnder && giocataUnder(m)) continue;
    if (!num(m.quota) || m.quota < C.quotaMin - EPS || m.quota > C.quotaMax + EPS) continue;
    if (!num(m.probPinnacle) || !mercatoAmmesso(m.mercato, m.selezione, partita.sport ?? 'calcio') || !quotaBet365Ok(m)) continue;
    const resa = m.quota * m.probPinnacle;
    const g = {
      sport: partita.sport ?? 'calcio', competizione: partita.competizione, partita: partita.partita,
      idPartita: partita.idPartita, inizio: partita.inizio, mercato: m.mercato, selezione: m.selezione,
      quota: m.quota, quotaBet365: num(m.quotaBet365) ? m.quotaBet365 : null, probMercato: m.probPinnacle,
      // Probabilità del nostro modello [utente, 29/10/2026]; per la pallavolo l'Elo "di studio", che non entra nelle giocate.
      probModello: num(m.probModello) ? m.probModello : num(m.probModelloStudio) ? m.probModelloStudio : null, resa, esito: null,
      // Bookmaker italiani con la loro quota (NBA, basket, pallavolo dalla raccolta; il calcio li aggiunge il giro).
      ...(Array.isArray(m.bookmaker) && m.bookmaker.length ? { bookmaker: m.bookmaker } : {}),
    };
    const cur = migliori.get(partita.idPartita);
    if (!cur || resa > cur.resa + EPS || (Math.abs(resa - cur.resa) <= EPS && g.probMercato > cur.probMercato)) migliori.set(partita.idPartita, g);
  }
  return [...migliori.values()].sort((a, b) => b.resa - a.resa || b.probMercato - a.probMercato);
}

const arrotonda = (x) => Math.round(x * 100) / 100;

function multipla(gambe, data) {
  const n = gambe.length;
  const quota = gambe.reduce((a, g) => a * g.quota, 1);
  const prob = gambe.reduce((a, g) => a * g.probMercato, 1);
  const inc = incremento(n);
  return {
    id: `MB${n}-${data}`,
    nome: `Multipla bonus bet365 da ${n}`,
    prova: true,
    gambe: [...gambe].sort((a, b) => Date.parse(a.inizio) - Date.parse(b.inizio)).map(({ resa, ...g }) => g),
    quota: arrotonda(quota),
    incremento: inc,
    quotaConBonus: arrotonda(quota * (1 + inc)),
    prob,
    valueAtteso: prob * quota * (1 + inc) - 1,
    esito: null,
    ritorno: null,
  };
}

// Le multiple del giorno: per ogni lunghezza le prime n gambe (quella da 20 contiene quella da 10).
// Tre multiple [utente, 26/10/2026]: da 10, da 20 e una con tutte le partite adatte (`lunga: true`, anche oltre 20;
// oltre 20 l'incremento resta al 100%). Ognuna solo se ci sono abbastanza partite; quando la lunga avrebbe le
// stesse partite di un'altra (esattamente 20, o tra 11 e 19 senza la da 20) non si ripete.
// `gambeProbabilita`: le gambe delle multiple per probabilità (senza Under), se diverse da `gambe`.
export function costruisciMultipleBonus(voci, { data, escluse, gambe = gambePossibili(voci, { escluse }), gambeProbabilita = gambe } = {}) {
  const out = [];
  for (const n of C.lunghezze) if (gambe.length >= n) out.push(multipla(gambe.slice(0, n), data));
  const corta = Math.min(...C.lunghezze);
  if (gambe.length > corta) {
    const uguale = out.find((m) => m.gambe.length === gambe.length);
    if (uguale) uguale.lunga = true;
    else out.push({ ...multipla(gambe, data), lunga: true });
  }
  const senza = senzaUnder(gambe, data);
  if (senza && gambe.length > corta) out.push(senza);
  out.push(...multiplePerProbabilita(gambeProbabilita, data));
  return out;
}

// Multiple con le partite più probabili [utente, 29/10/2026]: stesse gambe e regole del bonus, ma le prime n
// per probabilità di Pinnacle invece che per margine, da confrontare con quelle per margine.
export function multiplePerProbabilita(gambe, data) {
  const ordinate = [...gambe].sort((a, b) => b.probMercato - a.probMercato || b.resa - a.resa);
  return C.lunghezzeProbabilita.filter((n) => ordinate.length >= n).map((n) => ({
    ...multipla(ordinate.slice(0, n), data),
    id: `MBP${n}-${data}`,
    nome: `Multipla bonus bet365 da ${n} (le più probabili)`,
    criterio: 'probabilita',
  }));
}

// Under 2.5 e Under 3.5: le partite con queste giocate escono dalla multipla "senza Under" [utente, 26/10/2026].
export const giocataUnder = (g) => /^Under\/Over [23]\.5$/.test(g.mercato) && /^Under /.test(String(g.selezione));

// In più alle altre: la multipla con tutte le partite adatte, tolte le partite con Under 2.5 o 3.5 (la partita
// esce, non si sostituisce). Solo se ne toglie almeno una e ne restano almeno 2; incremento per le partite rimaste.
function senzaUnder(gambe, data) {
  const restano = gambe.filter((g) => !giocataUnder(g));
  if (restano.length === gambe.length || restano.length < 2) return null;
  const m = multipla(restano, data);
  return { ...m, id: `MBSU${restano.length}-${data}`, nome: `Multipla bonus bet365 senza Under (${restano.length} partite)`, senzaUnder: true };
}

// Esito con gli esiti delle gambe: una persa → persa; una ancora aperta → null; le rimborsate escono
// e l'incremento si ricalcola sulle gambe rimaste (regola bet365). `ritorno`: euro per 1 € puntato.
export function esitoMultiplaBonus(mb) {
  const esiti = mb.gambe.map((g) => g.esito);
  if (esiti.includes('persa')) return { esito: 'persa', ritorno: 0 };
  if (esiti.some((e) => e !== 'vinta' && e !== 'rimborsata')) return { esito: null, ritorno: null };
  const vinte = mb.gambe.filter((g) => g.esito === 'vinta');
  if (!vinte.length) return { esito: 'rimborsata', ritorno: 1 };
  const quota = vinte.reduce((a, g) => a * g.quota, 1);
  return { esito: 'vinta', ritorno: arrotonda(quota * (1 + incremento(vinte.length))) };
}
