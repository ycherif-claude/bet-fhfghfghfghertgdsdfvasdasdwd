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

export function gambePossibili(voci, { escluse = new Set() } = {}) {
  const migliori = new Map();
  for (const { partita, m } of voci) {
    if (escluse.has(partita.idPartita)) continue;
    if (!num(m.quota) || m.quota < C.quotaMin - EPS || m.quota > C.quotaMax + EPS) continue;
    if (!num(m.probPinnacle) || !mercatoAmmesso(m.mercato, m.selezione, partita.sport ?? 'calcio') || !quotaBet365Ok(m)) continue;
    const resa = m.quota * m.probPinnacle;
    const g = {
      sport: partita.sport ?? 'calcio', competizione: partita.competizione, partita: partita.partita,
      idPartita: partita.idPartita, inizio: partita.inizio, mercato: m.mercato, selezione: m.selezione,
      quota: m.quota, quotaBet365: num(m.quotaBet365) ? m.quotaBet365 : null, probMercato: m.probPinnacle, resa, esito: null,
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
// La più lunga (20) si fa anche con meno partite [utente, 26/10/2026]: con 11-19 partite adatte, una
// multipla con tutte (`lunga: true`); con 10 o meno solo quella da 10 (se ci sono 10 partite).
export function costruisciMultipleBonus(voci, { data, escluse } = {}) {
  const gambe = gambePossibili(voci, { escluse });
  const [corta, lunga] = [Math.min(...C.lunghezze), Math.max(...C.lunghezze)];
  const out = [];
  if (gambe.length >= corta) out.push(multipla(gambe.slice(0, corta), data));
  if (gambe.length > corta) out.push({ ...multipla(gambe.slice(0, Math.min(lunga, gambe.length)), data), lunga: true });
  return out;
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
