// Ricontrollo della lista del giorno [utente, 05/11/2026]: la lista esce al mattino, ma quota e mercato si muovono.
// Una volta per giocata, da `minutiRicontrollo` minuti prima dell'inizio, si rilegge il mercato e si salva l'esito sulla
// partita (`ricontrollo`): "fuori" se la quota è uscita dai limiti o modello e mercato non sono più d'accordo. Solo
// odss-api, nella stessa richiesta dei controlli. Un avviso e basta: la giocata resta nello storico, per misurare
// se il ricontrollo serve. Senza quote si riprova una volta sola a ridosso dell'inizio, per non consumare il budget.
import { CONFIG } from '../config.js';
import { isoRoma } from '../calcio/testo.js';

const L = CONFIG.coppieQuota2.lista;
const MIN = 60000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const giocate = (giornata) => (Array.isArray(giornata?.coppieQuota2?.lista) ? giornata.coppieQuota2.lista : [])
  .filter((c) => c?.id && c.gambe?.[0]?.idPartita);
const idVoce = (c) => `ricontrollo|${c.id}`;

// Gruppi [utente, 06/11/2026]: le partite che iniziano entro `minutiGruppo` minuti dalla prima del gruppo si
// ricontrollano insieme, da `minutiRicontrollo` minuti prima della prima. Così si possono giocare insieme, invece di
// aspettare un ricontrollo per ogni orario; e servono meno richieste. In cambio le ultime del gruppo si ricontrollano
// fino a `minutiGruppo` minuti prima del solito.
export function gruppiRicontrollo(giornata) {
  const inizi = [...new Set(giocate(giornata).map((c) => Date.parse(c.gambe[0].inizio)).filter(Number.isFinite))].sort((x, y) => x - y);
  const gruppi = [];
  for (const t of inizi) {
    const ultimo = gruppi.at(-1);
    if (ultimo && t - ultimo.primo <= L.minutiGruppo * MIN) ultimo.inizi.push(t);
    else gruppi.push({ primo: t, inizi: [t] });
  }
  return gruppi;
}

function daFare(g, adesso, primo) {
  const minuti = (Date.parse(g.inizio) - adesso.getTime()) / MIN;
  const minutiGruppo = (primo - adesso.getTime()) / MIN;
  if (!(minuti > 0) || Math.min(minuti, minutiGruppo) > L.minutiRicontrollo) return false;
  if (!g.ricontrollo) return true;
  return g.ricontrollo.esito === 'senza-quote' && g.ricontrollo.tentativi < 2 && minuti <= L.minutiUltimoRicontrollo;
}

export function vociRicontrollo(giornata, adesso) {
  const primoDi = new Map(gruppiRicontrollo(giornata).flatMap((gr) => gr.inizi.map((t) => [t, gr.primo])));
  return giocate(giornata).filter((c) => {
    const t = Date.parse(c.gambe[0].inizio);
    return daFare(c.gambe[0], adesso, primoDi.get(t) ?? t);
  }).map((c) => {
    const g = c.gambe[0];
    return { id: idVoce(c), sport: g.sport, competizione: g.competizione, partita: g.partita, idPartita: g.idPartita, inizio: g.inizio, mercato: g.mercato, selezione: g.selezione };
  });
}

// Esito dalle quote del momento. `prob`: Pinnacle se c'è, altrimenti la mediana dei bookmaker (come al mattino).
// Solo l'accordo tra modello e mercato [utente, 06/11/2026]: una quota scesa sotto 1,25 o salita sopra 1,70 non
// toglie più la giocata (i limiti di quota valgono al mattino, per scegliere la lista).
export function valutaRicontrollo(g, q) {
  const prob = num(q.prob) ? q.prob : num(q.probMediana) ? q.probMediana : null;
  const motivi = [];
  if (prob !== null && num(g.probModello) && Math.abs(g.probModello - prob) >= L.scarto) motivi.push(`modello e mercato non più d'accordo (mercato ${Math.round(prob * 100)}%)`);
  return { esito: motivi.length ? 'fuori' : 'confermata', motivi, quota: q.quota, prob };
}

// Senza quote [utente, 05/11/2026]: tra che quote giocarla lo stesso. Le quote dove modello e mercato restano d'accordo
// (dal 06/11 senza i limiti 1,25-1,70, come il ricontrollo). Senza modello, i limiti della lista. Il margine del bookmaker è quello del mattino sulla stessa partita (quota per probabilità
// del mercato); al mattino la quota è la migliore o la mediana dei bookmaker, quindi su bet365 è un'indicazione.
export function quoteGiocabili(g) {
  if (!num(g?.probModello)) return { min: L.quotaMin, max: L.quotaMax };
  const margine = num(g.quota) && num(g.probMercato) && g.quota * g.probMercato > 0 ? 1 / (g.quota * g.probMercato) : 1;
  const quotaDi = (p) => (p > 0 ? 1 / (margine * p) : Infinity);
  const min = Math.ceil(Math.max(1.01, quotaDi(g.probModello + L.scarto)) * 100) / 100;
  const max = Math.floor(quotaDi(g.probModello - L.scarto) * 100) / 100;
  return min <= max ? { min, max } : null;
}

// Orari indicativi dei ricontrolli [utente, 06/11/2026], uno per gruppo: da `minutiRicontrollo` a
// `minutiUltimoRicontrollo` minuti prima della prima partita. Il passaggio vero dipende da quando GitHub avvia i controlli.
export function orariRicontrollo(giornata) {
  const lista = giocate(giornata);
  return gruppiRicontrollo(giornata).map((gr) => ({
    primo: new Date(gr.primo),
    ultimo: new Date(gr.inizi.at(-1)),
    dalle: new Date(gr.primo - L.minutiRicontrollo * MIN),
    alle: new Date(gr.primo - L.minutiUltimoRicontrollo * MIN),
    partite: lista.filter((c) => gr.inizi.includes(Date.parse(c.gambe[0].inizio))).length,
  }));
}

// Avviso dell'ultimo momento [utente, 06/11/2026]: il ricontrollo a gruppi può cadere ore prima dell'inizio e il mercato
// si muove soprattutto alla fine (formazioni). La quota di chiusura (chiusura.js, da 45 minuti prima, stessa richiesta)
// si valuta come il ricontrollo e si salva in `ricontrollo.ultimo`. Solo per le giocate confermate o senza quote, e se
// la chiusura è una lettura successiva al ricontrollo. Restituisce quante giocate ha cambiato.
export function applicaUltimo(giornata) {
  let cambiate = 0;
  for (const c of giocate(giornata)) {
    const g = c.gambe[0];
    const r = g.ricontrollo;
    const ch = g.chiusura;
    if (!r || r.ultimo || r.esito === 'fuori' || !ch || !num(ch.quota)) continue;
    if (r.alle && ch.alle && Date.parse(r.alle) >= Date.parse(ch.alle)) continue;
    const v = valutaRicontrollo(g, { quota: ch.quota, prob: ch.prob, probMediana: ch.probMediana });
    r.ultimo = { esito: v.esito, motivi: v.motivi, quota: v.quota, prob: v.prob, alle: ch.alle, minutiPrima: ch.minutiPrima };
    cambiate++;
  }
  return cambiate;
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
export const GRUPPI_RICONTROLLO = ['confermata', 'fuori', 'senza-quote', 'nessuno', 'ultimo'];
export function storicoRicontrollo(giornate) {
  const gruppi = Object.fromEntries(GRUPPI_RICONTROLLO.map((k) => [k, { partite: 0, vinte: 0, perse: 0, rimborsate: 0, aperte: 0, guadagno: 0 }]));
  const fuori = [];
  for (const giornata of giornate) {
    if (!(giornata?.data >= INIZIO_RICONTROLLO)) continue;
    for (const c of giocate(giornata)) {
      const g = c.gambe[0];
      // Una confermata cambiata all'ultimo conta anche nel gruppo "ultimo".
      const dove = [gruppi[g.ricontrollo?.esito ?? 'nessuno'], ...(g.ricontrollo?.ultimo?.esito === 'fuori' ? [gruppi.ultimo] : [])];
      for (const r of dove.filter(Boolean)) {
        r.partite++;
        if (g.esito === 'vinta') { r.vinte++; r.guadagno += (num(g.quota) ? g.quota : 1) - 1; }
        else if (g.esito === 'persa') { r.perse++; r.guadagno -= 1; }
        else if (g.esito === 'rimborsata') r.rimborsate++;
        else r.aperte++;
      }
      if (g.ricontrollo?.esito === 'fuori') {
        fuori.push({ data: giornata.data, partita: g.partita, inizio: g.inizio, mercato: g.mercato, selezione: g.selezione, quota: g.quota, quotaRicontrollo: g.ricontrollo.quota ?? null, motivi: g.ricontrollo.motivi ?? [], esito: g.esito ?? null });
      }
    }
  }
  for (const r of Object.values(gruppi)) r.guadagno = Math.round(r.guadagno * 100) / 100;
  return { da: INIZIO_RICONTROLLO, gruppi, fuori: fuori.sort((a, b) => Date.parse(b.inizio) - Date.parse(a.inizio)) };
}
