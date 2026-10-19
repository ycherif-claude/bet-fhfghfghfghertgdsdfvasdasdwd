import { CONFIG } from '../config.js';
import { calcolaValue, quotaMinima } from './value.js';
import { classificaTipo, puntataConsigliata, quotaEffettiva } from './puntate.js';
import { costruisciMultiple } from './multiple.js';

const EPS = 1e-9;

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

// distanzaStop: euro che mancano allo stop settimanale (puntate in corso già contate come perse).
// Assente (chiamanti vecchi) = nessun limite dallo stop.
export function selezionaGiocate(candidati, { bankroll, inGiocoOggi, stopRaggiunto, distanzaStop = Infinity }) {
  const scartate = [];
  const scarta = (id, motivo) => scartate.push({ idCandidato: id, motivo });

  if (stopRaggiunto) {
    candidati.forEach((c) => scarta(c.id, 'stop settimanale'));
    return { giocate: [], scartate };
  }

  // Classificazione, range e soglia di value.
  const valide = [];
  for (const c of candidati) {
    const tipo = classificaTipo(c);
    if (!tipo) { scarta(c.id, 'quota fuori range'); continue; }
    const g = creaGiocata(c, tipo, bankroll);
    const soglia = tipo === 'singola' ? CONFIG.sogliaValue : CONFIG.sogliaValueSpeciali;
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
  const { singole: maxS, builder: maxB } = CONFIG.massimiGiornalieri;
  singole.slice(maxS).forEach((g) => scarta(g.id, 'limite giornaliero singole'));
  singole = singole.slice(0, maxS);
  const builder = valide.filter((x) => x.tipo === 'builder').sort(perValue);
  builder.slice(maxB).forEach((g) => scarta(g.id, 'limite giornaliero builder'));

  const multiple = costruisciMultiple(singole, bankroll);
  const tutte = [...singole, ...builder.slice(0, maxB), ...multiple].sort(perValue);

  // Puntata minima, tetto giornaliero e stop settimanale, per value decrescente.
  // Le puntate proposte contano come perse: la loro somma non supera mai
  // né il tetto residuo di oggi né la distanza dallo stop.
  const giocate = [];
  const residuoTetto = CONFIG.tettoGiornaliero * bankroll - inGiocoOggi;
  // Valore non numerico (dato corrotto): per prudenza nessuna nuova puntata.
  const residuoStop = typeof distanzaStop === 'number' && !Number.isNaN(distanzaStop) ? distanzaStop : 0;
  const limite = Math.min(residuoTetto, residuoStop);
  const motivoLimite = residuoStop < residuoTetto ? 'stop settimanale' : 'tetto giornaliero';
  let proposto = 0;
  for (const g of tutte) {
    if (g.puntata.euro <= 0) { scarta(g.id, 'puntata troppo bassa'); continue; }
    const totale = proposto + g.puntata.euro;
    if (totale > limite + EPS) { scarta(g.id, motivoLimite); continue; }
    proposto = totale;
    giocate.push(g);
  }
  return { giocate, scartate };
}
