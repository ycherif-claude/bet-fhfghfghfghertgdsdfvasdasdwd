// Quota di chiusura delle partite di coppie e multiple [utente, 29/10/2026]: nell'ultimo controllo prima dell'inizio
// (da `finestre.ultimo` minuti prima) si legge la quota del momento e la probabilità di Pinnacle senza margine, e si
// salvano sulla partita (`chiusura`). Confrontate con quelle del mattino dicono se il mercato si è mosso verso le
// nostre scelte: è il segnale più rapido per capire se un metodo ha un vantaggio. Solo odss-api (nella stessa
// richiesta dei controlli): nessuna richiesta alle fonti di prima. Una volta per partita.
import { isoRoma } from '../calcio/testo.js';
import { tutteLeCoppie } from '../regole/coppie-quota2.js';
import { momento } from './controlli.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const chiave = (g) => `${g.idPartita}|${g.mercato}|${g.selezione}`;
const tutteLeGambe = (giornata) => [
  ...(Array.isArray(giornata?.multipleBonus) ? giornata.multipleBonus : []),
  ...tutteLeCoppie(giornata),
].flatMap((x) => (Array.isArray(x?.gambe) ? x.gambe : [])).filter((g) => g && g.idPartita);

// Voci da controllare (una per partita e mercato) nell'ultima finestra prima dell'inizio, ancora senza chiusura.
export function vociChiusura(giornata, adesso) {
  const voci = new Map();
  for (const g of tutteLeGambe(giornata)) {
    if (g.chiusura || voci.has(chiave(g))) continue;
    const v = {
      id: `chiusura|${chiave(g)}`, sport: g.sport, competizione: g.competizione, partita: g.partita,
      idPartita: g.idPartita, inizio: g.inizio, mercato: g.mercato, selezione: g.selezione,
    };
    if (momento(v, adesso) === 'ultimo') voci.set(chiave(g), v);
  }
  return [...voci.values()];
}

// Salva la chiusura su tutte le copie della partita (in multiple e coppie). Restituisce quante partite.
export function applicaChiusura(giornata, quote, adesso) {
  const ora = isoRoma(adesso);
  const fatte = new Set();
  for (const g of tutteLeGambe(giornata)) {
    const q = quote.get(`chiusura|${chiave(g)}`);
    if (g.chiusura || !q || !num(q.quota)) continue;
    g.chiusura = {
      quota: q.quota, prob: num(q.prob) ? q.prob : null, alle: ora,
      minutiPrima: Math.round((Date.parse(g.inizio) - adesso.getTime()) / 60000),
    };
    fatte.add(chiave(g));
  }
  return fatte.size;
}
