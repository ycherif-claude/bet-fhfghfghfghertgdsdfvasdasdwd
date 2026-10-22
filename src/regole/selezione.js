import { CONFIG } from '../config.js';
import { calcolaValue, quotaMinima, probValida } from './value.js';
import { classificaTipo, puntataConsigliata, quotaEffettiva } from './puntate.js';
import { costruisciMultiple } from './multiple.js';

const EPS = 1e-9;

// Dati minimi per valutare un candidato: probabilità in (0, 1), inizio leggibile,
// quota null (da verificare) oppure numero maggiore di 1.
function datiValidi(c) {
  const quotaOk = c.quota === null || c.quota === undefined || (Number.isFinite(c.quota) && c.quota > 1);
  return probValida(c.prob) && Number.isFinite(Date.parse(c.inizio)) && quotaOk;
}

function creaGiocata(candidato, tipo, bankroll) {
  const quota = quotaEffettiva(candidato, tipo);
  return {
    ...candidato,
    tipo,
    value: calcolaValue(candidato.prob, quota),
    quotaMinima: quotaMinima(candidato, tipo),
    puntata: puntataConsigliata({ tipo, prob: candidato.prob, quota, bankroll }),
    stato: 'in_attesa',
    motivoStato: null,
    oraUltimoControllo: null,
    esito: null,
  };
}

export const MOTIVO_TETTO = 'tetto giornaliero';
export const MOTIVO_FISSA = 'giornata piena';
export const MOTIVO_DATI_BANKROLL = 'dati del bankroll non numerici';

// inGiocoOggi: euro già in gioco oggi (segnati e proposti); -Infinity = nessun tetto (primo passaggio del serale).
// giornataPiena: oggi è già in caso C (giro serale) → tutte le nuove giocate a puntata fissa, senza tetto.
// Lo stop settimanale non esiste più [utente, 21/10/2026]: eventuali campi dello stop si ignorano.
// `prova` (modalità prova): ogni value positivo e fino a CONFIG.prova.massimiSingole singole.
export function selezionaGiocate(candidati, { bankroll, inGiocoOggi, giornataPiena = false }, { prova = false } = {}) {
  const scartate = [];
  const scarta = (id, motivo) => scartate.push({ idCandidato: id, motivo });

  // Classificazione, range e soglia di value.
  const valide = [];
  for (const c of candidati) {
    if (!datiValidi(c)) { scarta(c.id, 'dati non validi'); continue; }
    const tipo = classificaTipo(c);
    if (!tipo) { scarta(c.id, 'quota fuori range'); continue; }
    const g = creaGiocata(c, tipo, bankroll);
    const soglia = prova ? CONFIG.prova.sogliaValue : tipo === 'singola' ? CONFIG.sogliaValue : CONFIG.sogliaValueSpeciali;
    if (g.value < soglia - EPS) { scarta(c.id, 'value insufficiente'); continue; }
    valide.push(g);
  }
  const perValue = (a, b) => b.value - a.value;

  // Una sola singola (o speciale) per partita, quella con value più alto.
  let singole = [];
  const viste = new Set();
  for (const g of valide.filter((x) => x.tipo !== 'builder').sort(perValue)) {
    if (viste.has(g.idPartita)) { scarta(g.id, 'altra giocata sulla stessa partita'); continue; }
    viste.add(g.idPartita);
    singole.push(g);
  }
  // Tetti giornalieri: 10 singole, 2 builder.
  const { builder: maxB } = CONFIG.massimiGiornalieri;
  const maxS = prova ? CONFIG.prova.massimiSingole : CONFIG.massimiGiornalieri.singole;
  singole.slice(maxS).forEach((g) => scarta(g.id, 'limite giornaliero singole'));
  singole = singole.slice(0, maxS);
  const builder = valide.filter((x) => x.tipo === 'builder').sort(perValue);
  builder.slice(maxB).forEach((g) => scarta(g.id, 'limite giornaliero builder'));

  const multiple = costruisciMultiple(singole, bankroll);
  const tutte = [...singole, ...builder.slice(0, maxB), ...multiple].sort(perValue);

  // Bankroll o soldi in gioco non numerici (dato corrotto, anche +Infinity da una puntata illeggibile):
  // per prudenza nessuna nuova puntata, nemmeno fissa. -Infinity resta valido: nessun tetto.
  const datiOk = Number.isFinite(bankroll)
    && typeof inGiocoOggi === 'number' && (Number.isFinite(inGiocoOggi) || inGiocoOggi === -Infinity);
  const daPuntare = [];
  for (const g of tutte) {
    if (!(g.puntata.euro > 0)) { scarta(g.id, 'puntata troppo bassa'); continue; }
    if (!datiOk) { scarta(g.id, MOTIVO_DATI_BANKROLL); continue; }
    daPuntare.push(g);
  }
  if (giornataPiena === true) return { giocate: daPuntare.map((g) => conPuntataFissa(g, bankroll)), scartate };
  const giocate = applicaTetto(daPuntare, { limite: CONFIG.tettoGiornaliero * bankroll - inGiocoOggi, bankroll });
  return { giocate, scartate };
}

const centesimi = (euro) => Math.round(euro * 100);
const percentualeDi = (euro, bankroll) => Math.round((euro / bankroll) * 10000) / 100;

// Caso C: puntata fissa CONFIG.puntataMinima (1 €), `fissa.da` = la puntata Kelly originale.
function conPuntataFissa(g, bankroll) {
  const euro = CONFIG.puntataMinima;
  return { ...g, puntata: { ...g.puntata, euro, percentuale: percentualeDi(euro, bankroll), fissa: { da: g.puntata.euro, motivo: MOTIVO_FISSA } } };
}

// Tetto giornaliero a tre casi [utente, 21/10/2026]. `limite` = residuo del tetto (euro).
// A. Somma ≤ limite: puntate invariate.
// B. Somma oltre: ogni puntata × (limite / somma), arrotondata per difetto a CONFIG.arrotondamentoRidotte
//    (conti in centesimi interi, la somma non supera mai il limite), se così TUTTE restano ≥ CONFIG.puntataMinima.
// C. Altrimenti per oggi il tetto non si applica: TUTTE a puntata fissa da CONFIG.puntataMinima. Nessuna scartata.
function applicaTetto(giocate, { limite, bankroll }) {
  const limiteCent = Math.floor(limite * 100 + EPS);
  const sommaCent = giocate.reduce((a, g) => a + centesimi(g.puntata.euro), 0);
  if (!(sommaCent > limiteCent)) return giocate;
  const passo = centesimi(CONFIG.arrotondamentoRidotte);
  const ridotte = giocate.map((g) => {
    const quota = Math.floor((centesimi(g.puntata.euro) * Math.max(0, limiteCent)) / sommaCent);
    return { g, cent: Math.floor(quota / passo) * passo };
  });
  if (ridotte.some((r) => r.cent < centesimi(CONFIG.puntataMinima))) return giocate.map((g) => conPuntataFissa(g, bankroll));
  return ridotte.map(({ g, cent }) => {
    const euro = cent / 100;
    return { ...g, puntata: { ...g.puntata, euro, percentuale: percentualeDi(euro, bankroll), ridotta: { da: g.puntata.euro, motivo: MOTIVO_TETTO } } };
  });
}
