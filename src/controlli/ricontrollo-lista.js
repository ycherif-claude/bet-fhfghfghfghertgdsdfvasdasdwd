// Ricontrollo della lista del giorno [utente, 05/11/2026]: la lista esce al mattino, ma quota e mercato si muovono.
// Una volta per giocata, da `minutiRicontrollo` minuti prima dell'inizio, si rilegge il mercato e si salva l'esito sulla
// partita (`ricontrollo`): "fuori" se la quota è uscita dai limiti o modello e mercato non sono più d'accordo. Solo
// odss-api, nella stessa richiesta dei controlli. Un avviso e basta: la giocata resta nello storico, per misurare
// se il ricontrollo serve. Senza quote si riprova una volta sola a ridosso dell'inizio, per non consumare il budget.
import { CONFIG } from '../config.js';
import { isoRoma } from '../calcio/testo.js';

const L = CONFIG.coppieQuota2.lista;
const MIN = 60000;
const virgola = (q) => q.toFixed(2).replace('.', ',');
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const giocate = (giornata) => (Array.isArray(giornata?.coppieQuota2?.lista) ? giornata.coppieQuota2.lista : [])
  .filter((c) => c?.id && c.gambe?.[0]?.idPartita);
const idVoce = (c) => `ricontrollo|${c.id}`;

function daFare(g, adesso) {
  const minuti = (Date.parse(g.inizio) - adesso.getTime()) / MIN;
  if (!(minuti > 0) || minuti > L.minutiRicontrollo) return false;
  if (!g.ricontrollo) return true;
  return g.ricontrollo.esito === 'senza-quote' && g.ricontrollo.tentativi < 2 && minuti <= L.minutiUltimoRicontrollo;
}

export function vociRicontrollo(giornata, adesso) {
  return giocate(giornata).filter((c) => daFare(c.gambe[0], adesso)).map((c) => {
    const g = c.gambe[0];
    return { id: idVoce(c), sport: g.sport, competizione: g.competizione, partita: g.partita, idPartita: g.idPartita, inizio: g.inizio, mercato: g.mercato, selezione: g.selezione };
  });
}

// Esito dalle quote del momento. `prob`: Pinnacle se c'è, altrimenti la mediana dei bookmaker (come al mattino).
export function valutaRicontrollo(g, q) {
  const prob = num(q.prob) ? q.prob : num(q.probMediana) ? q.probMediana : null;
  const motivi = [];
  if (q.quota < L.quotaMin) motivi.push(`quota ${virgola(q.quota)} sotto ${virgola(L.quotaMin)}`);
  if (q.quota > L.quotaMax) motivi.push(`quota ${virgola(q.quota)} sopra ${virgola(L.quotaMax)}`);
  if (prob !== null && num(g.probModello) && Math.abs(g.probModello - prob) >= L.scarto) motivi.push(`modello e mercato non più d'accordo (mercato ${Math.round(prob * 100)}%)`);
  return { esito: motivi.length ? 'fuori' : 'confermata', motivi, quota: q.quota, prob };
}

// Salva l'esito sulle giocate di `voci`. Restituisce quante ne ha cambiate.
export function applicaRicontrollo(giornata, quote, voci, adesso) {
  const ids = new Set(voci.map((v) => v.id));
  const alle = isoRoma(adesso);
  let cambiate = 0;
  for (const c of giocate(giornata)) {
    if (!ids.has(idVoce(c))) continue;
    const g = c.gambe[0];
    const q = quote.get(idVoce(c));
    const minutiPrima = Math.round((Date.parse(g.inizio) - adesso.getTime()) / MIN);
    g.ricontrollo = q && num(q.quota)
      ? { ...valutaRicontrollo(g, q), alle, minutiPrima }
      : { esito: 'senza-quote', tentativi: (g.ricontrollo?.tentativi ?? 0) + 1, alle, minutiPrima };
    cambiate++;
  }
  return cambiate;
}
