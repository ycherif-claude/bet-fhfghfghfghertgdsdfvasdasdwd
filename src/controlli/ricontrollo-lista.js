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

// Senza quote [utente, 05/11/2026]: tra che quote giocarla lo stesso. Le quote dove modello e mercato restano d'accordo,
// dentro i limiti della lista. Il margine del bookmaker è quello del mattino sulla stessa partita (quota per probabilità
// del mercato); al mattino la quota è la migliore o la mediana dei bookmaker, quindi su bet365 è un'indicazione.
export function quoteGiocabili(g) {
  if (!num(g?.probModello)) return { min: L.quotaMin, max: L.quotaMax };
  const margine = num(g.quota) && num(g.probMercato) && g.quota * g.probMercato > 0 ? 1 / (g.quota * g.probMercato) : 1;
  const quotaDi = (p) => (p > 0 ? 1 / (margine * p) : Infinity);
  const min = Math.ceil(Math.max(L.quotaMin, quotaDi(g.probModello + L.scarto)) * 100) / 100;
  const max = Math.floor(Math.min(L.quotaMax, quotaDi(g.probModello - L.scarto)) * 100) / 100;
  return min <= max ? { min, max } : null;
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
      : { esito: 'senza-quote', tentativi: (g.ricontrollo?.tentativi ?? 0) + 1, alle, minutiPrima, giocaTra: quoteGiocabili(g) };
    cambiate++;
  }
  return cambiate;
}

// Storico del ricontrollo [utente, 05/11/2026]: per ogni esito del ricontrollo quante giocate della lista sono uscite
// vinte o perse, con il guadagno a 1 € giocandole tutte. Per le "fuori" dice se toglierle è stato giusto (perse) o
// sbagliato (vinte); `guadagno` è quanto avrebbero reso se giocate lo stesso. Dal giorno in cui il ricontrollo è
// partito, le giocate senza ricontrollo (il passaggio non è arrivato in tempo) hanno un gruppo a parte.
export const INIZIO_RICONTROLLO = '2026-11-05';
export const GRUPPI_RICONTROLLO = ['confermata', 'fuori', 'senza-quote', 'nessuno'];
export function storicoRicontrollo(giornate) {
  const gruppi = Object.fromEntries(GRUPPI_RICONTROLLO.map((k) => [k, { partite: 0, vinte: 0, perse: 0, rimborsate: 0, aperte: 0, guadagno: 0 }]));
  const fuori = [];
  for (const giornata of giornate) {
    if (!(giornata?.data >= INIZIO_RICONTROLLO)) continue;
    for (const c of giocate(giornata)) {
      const g = c.gambe[0];
      const r = gruppi[g.ricontrollo?.esito ?? 'nessuno'];
      if (!r) continue;
      r.partite++;
      if (g.esito === 'vinta') { r.vinte++; r.guadagno += (num(g.quota) ? g.quota : 1) - 1; }
      else if (g.esito === 'persa') { r.perse++; r.guadagno -= 1; }
      else if (g.esito === 'rimborsata') r.rimborsate++;
      else r.aperte++;
      if (g.ricontrollo?.esito === 'fuori') {
        fuori.push({ data: giornata.data, partita: g.partita, inizio: g.inizio, mercato: g.mercato, selezione: g.selezione, quota: g.quota, quotaRicontrollo: g.ricontrollo.quota ?? null, motivi: g.ricontrollo.motivi ?? [], esito: g.esito ?? null });
      }
    }
  }
  for (const r of Object.values(gruppi)) r.guadagno = Math.round(r.guadagno * 100) / 100;
  return { da: INIZIO_RICONTROLLO, gruppi, fuori: fuori.sort((a, b) => Date.parse(b.inizio) - Date.parse(a.inizio)) };
}
