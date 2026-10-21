// Esiti rapidi: subito dopo la fine della partita, solo per le giocate segnate come fatte, dalle fonti
// gratuite (ESPN per calcio, NBA e tennis; API Eurolega; TheSportsDB per NBL e pallavolo).
// Le regole sono quelle degli esiti del mattino, che restano la rete di sicurezza: se qui un risultato
// manca o è incerto, non si scrive niente. Si scrive solo `esito` (gamba e giocata).
// Cartellini e angoli del calcio: solo `esitoProvvisorio` ({ esito, dettaglio }) dai numeri di ESPN,
// per la notifica; `esito` lo scrive soltanto il giro del mattino (src/calcio/esiti.js) [utente].
import fs from 'node:fs';
import path from 'node:path';
import { giornataDi } from '../bankroll/settimana.js';
import { segnateComeGiocate, esitoSelezione } from '../calcio/esiti.js';
import { chiusura, gambeDi } from './comune.js';
import { esitoNba } from '../nba/esiti.js';
import { esitoTennis } from '../tennis/esiti.js';
import { esitoPallavolo } from '../pallavolo/esiti.js';
import { codiceSquadra } from '../basket/squadre.js';
import { abbinaSquadra, squadreStorico } from '../pallavolo/squadre.js';
import { CAMPIONATI_PALLAVOLO } from '../pallavolo/campionati.js';
import { stagioneBasket } from '../basket/storico.js';
import { CAMPIONATI_ESPN, espn } from '../controlli/espn.js';
import { eurolega } from '../basket/fonti/eurolega.js';
import { thesportsdb } from '../basket/fonti/thesportsdb.js';
import { squadreDi, trovaEvento } from '../controlli/quote.js';
import { scarica } from '../calcio/fonti/http.js';

const MIN = 60000;
// Minuti dopo l'inizio dai quali si cerca il risultato, e ore dopo le quali si lascia al mattino.
const ATTESA = { calcio: 110, nba: 140, basket: 115, tennis: 75, pallavolo: 80 };
const ORE_MAX = 10;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const somma = (a, b) => (num(a) && num(b) ? a + b : null);
const intero = (v) => (v !== undefined && v !== null && /^\d+$/.test(String(v)) ? Number(v) : null);
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

const json = (testo) => JSON.parse(testo);

// --- risultati per sport (null se la partita non è finita o non si trova) ---

async function risultatoCalcio(gamba, fonti) {
  const campionato = CAMPIONATI_ESPN[gamba.competizione];
  if (!campionato) return null;
  const giorno = new Date(gamba.inizio).toISOString().slice(0, 10);
  const ev = trovaEvento(gamba, await fonti.espn.partite(campionato, giorno));
  if (!ev) return null;
  const d = json((await scarica(`${ESPN}/${campionato}/summary?event=${ev.id}`, fonti.opz)).testo);
  const c = d.header?.competitions?.[0];
  // Solo i 90 minuti: supplementari e rigori li decide il mattino (STATUS_FINAL_AET / _PEN).
  if (c?.status?.type?.name !== 'STATUS_FULL_TIME') return null;
  const lato = (h) => c.competitors?.find((x) => x.homeAway === h);
  const pt = (h) => intero(lato(h)?.linescores?.[0]?.displayValue);
  // Angoli e cartellini non si chiudono da ESPN: conta i cartellini in modo diverso da
  // football-data/bet365 (doppio giallo = 2 gialli + 1 rosso) e un esito scritto qui è definitivo.
  // Li decide il giro del mattino; qui servono solo per l'esito provvisorio (`conteggi`).
  // Statistiche della squadra scelta per homeAway, mai per posizione nell'elenco.
  const squadra = (h) => (d.boxscore?.teams ?? []).find((x) => x.homeAway === h);
  const stat = (h, nome) => intero(squadra(h)?.statistics?.find((x) => x.name === nome)?.displayValue);
  const cart = (h) => somma(stat(h, 'yellowCards'), stat(h, 'redCards'));
  return {
    gc: intero(lato('home')?.score), gt: intero(lato('away')?.score),
    gcPT: pt('home'), gtPT: pt('away'),
    conteggi: { cartC: cart('home'), cartT: cart('away'), angoliC: stat('home', 'wonCorners'), angoliT: stat('away', 'wonCorners') },
  };
}

const CONTEGGIO = /^(Cartellini|Angoli) Under\/Over \d+(?:\.\d+)?$/;
const mercatoConteggio = (mercato) => CONTEGGIO.test(String(mercato ?? ''));

// Esito provvisorio di cartellini o angoli dai numeri di ESPN, oppure null.
function provvisorio(gamba, r) {
  const { conteggi, ...gol } = r;
  const e = esitoSelezione(gamba.mercato, gamba.selezione, { ...gol, ...conteggi });
  if (!e) return null;
  const cartellini = /^Cartellini/.test(gamba.mercato);
  const totale = cartellini ? conteggi.cartC + conteggi.cartT : conteggi.angoliC + conteggi.angoliT;
  return { esito: e, dettaglio: `${totale} ${cartellini ? 'cartellini' : 'angoli'} secondo ESPN, conteggio da confermare` };
}

async function risultatoNba(gamba, fonti) {
  const giorni = [0, -1].map((d) => new Date(Date.parse(gamba.inizio) + d * 86400000).toISOString().slice(0, 10));
  for (const g of giorni) {
    const r = json((await scarica(`${ESPN}/basketball/nba/scoreboard?dates=${g.replaceAll('-', '')}`, fonti.opz)).testo);
    const eventi = (r.events ?? []).map((e) => {
      const c = e.competitions?.[0];
      const di = (h) => c?.competitors?.find((x) => x.homeAway === h);
      return { casa: di('home')?.team?.displayName, trasferta: di('away')?.team?.displayName, inizio: e.date,
        puntiCasa: intero(di('home')?.score), puntiTrasferta: intero(di('away')?.score), finita: c?.status?.type?.completed === true && c.status.type.name === 'STATUS_FINAL' };
    });
    const e = trovaEvento(gamba, eventi);
    if (e) return e.finita ? { ...e, ...squadreDi(gamba.partita) } : null;
  }
  return null;
}

async function risultatoTennis(gamba, fonti) {
  const circuito = /^WTA/i.test(gamba.competizione) ? 'wta' : 'atp';
  const giorno = new Date(gamba.inizio).toISOString().slice(0, 10).replaceAll('-', '');
  const r = json((await scarica(`${ESPN}/tennis/${circuito}/scoreboard?dates=${giorno}`, fonti.opz)).testo);
  const sq = squadreDi(gamba.partita);
  const cognome = (n) => String(n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).at(-1);
  const voluti = new Set([cognome(sq.casa), cognome(sq.trasferta)]);
  for (const t of r.events ?? []) {
    for (const gr of t.groupings ?? []) {
      for (const c of gr.competitions ?? []) {
        const g = c.competitors ?? [];
        if (g.length !== 2 || !g.every((x) => voluti.has(cognome(x.athlete?.displayName)))) continue;
        const stato = c.status?.type?.name;
        if (stato !== 'STATUS_FINAL' && stato !== 'STATUS_RETIRED') return null;
        const w = g.find((x) => x.winner);
        const l = g.find((x) => !x.winner);
        if (!w || !l) return null;
        const set = (x) => (x.linescores ?? []).map((s) => s.value).filter(num);
        // I nomi della giocata (The Odds API), così l'esito si abbina sempre.
        const nome = (x) => (cognome(x.athlete?.displayName) === cognome(sq.casa) ? sq.casa : sq.trasferta);
        return { vincitore: nome(w), perdente: nome(l), setW: set(w), setL: set(l),
          commento: stato === 'STATUS_RETIRED' ? 'Retired' : null, completa: stato === 'STATUS_FINAL' };
      }
    }
  }
  return null;
}

// Ultime giornate salvate dello storico (la partita è nella più recente o nella successiva).
function giornateRecenti(dirData, file) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dirData, 'storico', `${file}.json`), 'utf8'));
    const ultima = Math.max(0, ...(j.partite ?? []).map((p) => p.giornata ?? 0));
    return { partite: j.partite ?? [], giornate: [...new Set([ultima, ultima + 1].filter((g) => g > 0))] };
  } catch {
    return { partite: [], giornate: [] };
  }
}

async function risultatoBasket(gamba, fonti, dirData) {
  const sq = squadreDi(gamba.partita);
  const camp = gamba.competizione === 'Eurolega' ? 'eurolega' : gamba.competizione === 'NBL (Australia)' ? 'nbl' : null;
  if (!camp || !sq) return null;
  const casa = codiceSquadra(camp, sq.casa);
  const trasferta = codiceSquadra(camp, sq.trasferta);
  if (!casa || !trasferta) return null;
  const stagione = stagioneBasket(new Date(gamba.inizio).toISOString().slice(0, 10));
  const { giornate } = giornateRecenti(dirData, camp);
  for (const g of giornate) {
    const { partite } = camp === 'eurolega' ? await fonti.eurolega.giornata(stagione, g) : await fonti.thesportsdb.round(stagione, g);
    const p = partite.find((x) => x.finita !== false
      && (camp === 'eurolega' ? x.casa === casa && x.trasferta === trasferta : codiceSquadra('nbl', x.casa) === casa && codiceSquadra('nbl', x.trasferta) === trasferta)
      && Math.abs(Date.parse(x.inizio ?? `${x.data}T12:00:00Z`) - Date.parse(gamba.inizio)) < 36 * 3600000);
    if (p) return { ...sq, puntiCasa: p.puntiCasa, puntiTrasferta: p.puntiTrasferta, campionato: camp };
  }
  return null;
}

async function risultatoPallavolo(gamba, fonti, dirData) {
  const c = CAMPIONATI_PALLAVOLO.find((x) => x.competizione === gamba.competizione);
  const sq = squadreDi(gamba.partita);
  if (!c?.thesportsdb || !sq) return null;
  const { partite: salvate, giornate } = giornateRecenti(dirData, `pallavolo-${c.id}`);
  const squadre = squadreStorico(salvate);
  const idCasa = abbinaSquadra(sq.casa, squadre);
  const idTrasferta = abbinaSquadra(sq.trasferta, squadre);
  if (!idCasa || !idTrasferta) return null;
  const stagione = stagioneBasket(new Date(gamba.inizio).toISOString().slice(0, 10));
  for (const g of giornate) {
    const { partite } = await fonti.thesportsdb.round(stagione, g, {}, c.thesportsdb);
    const p = partite.find((x) => x.finita && x.idCasa === idCasa && x.idTrasferta === idTrasferta
      && Math.abs(Date.parse(x.inizio) - Date.parse(gamba.inizio)) < 36 * 3600000);
    if (p) return { ...sq, setCasa: p.puntiCasa, setTrasferta: p.puntiTrasferta };
  }
  return null;
}

// Esito di una gamba dal suo risultato, con le regole di ogni sport.
export async function esitoRapido(gamba, fonti, dirData) {
  return (await valutaGamba(gamba, fonti, dirData))?.esito ?? null;
}

// { esito } oppure, per cartellini e angoli del calcio, { esitoProvvisorio }; null se non si sa.
async function valutaGamba(gamba, fonti, dirData) {
  if (gamba.sport === 'calcio') {
    const r = await risultatoCalcio(gamba, fonti);
    if (!r) return null;
    if (mercatoConteggio(gamba.mercato)) {
      const p = provvisorio(gamba, r);
      return p ? { esitoProvvisorio: p } : null;
    }
    const { conteggi, ...gol } = r;
    const e = esitoSelezione(gamba.mercato, gamba.selezione, gol);
    return e ? { esito: e } : null;
  }
  const e = await esitoAltriSport(gamba, fonti, dirData);
  return e ? { esito: e } : null;
}

async function esitoAltriSport(gamba, fonti, dirData) {
  if (gamba.sport === 'nba') {
    const r = await risultatoNba(gamba, fonti);
    return r ? esitoNba(gamba.mercato, gamba.selezione, r) : null;
  }
  if (gamba.sport === 'tennis') {
    const r = await risultatoTennis(gamba, fonti);
    return r ? esitoTennis(gamba.selezione, r) : null;
  }
  if (gamba.sport === 'basket') {
    const r = await risultatoBasket(gamba, fonti, dirData);
    return r ? esitoNba(gamba.mercato, gamba.selezione, r, (n) => codiceSquadra(r.campionato, n)) : null;
  }
  if (gamba.sport === 'pallavolo') {
    const r = await risultatoPallavolo(gamba, fonti, dirData);
    return r ? esitoPallavolo(gamba.mercato, gamba.selezione, r) : null;
  }
  return null;
}

const fontiDefault = () => ({ espn, eurolega, thesportsdb, opz: {} });

// Un passaggio: giornate di oggi e di ieri, giocate fatte senza esito, gambe finite da `ATTESA` minuti.
export async function eseguiEsitiRapidi({ dirData, adesso, fonti = fontiDefault() }) {
  const dirGiornate = path.join(dirData, 'giornate');
  const segnate = segnateComeGiocate(dirGiornate);
  const oggi = giornataDi(adesso);
  const ieri = new Date(Date.parse(`${oggi}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const errori = [];
  let aggiornate = 0;
  for (const data of [ieri, oggi]) {
    const file = path.join(dirGiornate, `${data}.json`);
    if (!fs.existsSync(file)) continue;
    const giornata = JSON.parse(fs.readFileSync(file, 'utf8'));
    let cambiato = false;
    for (const g of giornata.giocate ?? []) {
      if (!g || g.esito != null || !segnate.has(g.id)) continue;
      const prima = g.esito;
      for (const x of gambeDi(g)) {
        const sport = x.sport ?? g.sport;
        const trascorso = adesso.getTime() - Date.parse(x.inizio);
        if (x.esito != null || x.esitoProvvisorio || trascorso < (ATTESA[sport] ?? 120) * MIN || trascorso > ORE_MAX * 60 * MIN) continue;
        try {
          const v = await valutaGamba({ ...x, sport, competizione: x.competizione ?? g.competizione }, fonti, dirData);
          if (v?.esito) { x.esito = v.esito; cambiato = true; }
          if (v?.esitoProvvisorio) { x.esitoProvvisorio = v.esitoProvvisorio; cambiato = true; }
        } catch (err) {
          errori.push(`${x.partita}: ${err?.message ?? err}`);
        }
      }
      // Per una singola la gamba è la giocata stessa: l'esito è già scritto, si conta e basta.
      const esito = chiusura(g);
      if (esito !== null) { g.esito = esito; cambiato = true; }
      if (prima == null && g.esito != null) aggiornate++;
    }
    if (cambiato) fs.writeFileSync(file, `${JSON.stringify(giornata, null, 2)}\n`);
  }
  return { aggiornate, errori };
}
