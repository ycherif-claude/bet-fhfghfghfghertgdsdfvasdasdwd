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
    if (!datiValidi(c)) { scarta(c.id, 'dati non validi'); continue; }
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

  // Puntata minima, tetto giornaliero e stop settimanale.
  // Le puntate proposte contano come perse: la loro somma non supera mai
  // né il tetto residuo di oggi né la distanza dallo stop. Se la superano,
  // tutte le puntate si riducono nella stessa proporzione (vedi riduciAlLimite).
  const residuoTetto = CONFIG.tettoGiornaliero * bankroll - inGiocoOggi;
  // Valore non numerico (dato corrotto): per prudenza nessuna nuova puntata.
  const residuoStop = typeof distanzaStop === 'number' && !Number.isNaN(distanzaStop) ? distanzaStop : 0;
  const limite = Math.min(residuoTetto, residuoStop);
  const motivoLimite = residuoStop < residuoTetto ? 'stop settimanale' : 'tetto giornaliero';
  const daPuntare = [];
  for (const g of tutte) {
    if (g.puntata.euro <= 0) { scarta(g.id, 'puntata troppo bassa'); continue; }
    daPuntare.push(g);
  }
  const giocate = riduciAlLimite(daPuntare, { limite, motivo: motivoLimite, bankroll, scarta });
  return { giocate, scartate };
}

const centesimi = (euro) => Math.round(euro * 100);

// Somma delle puntate oltre il limite: ogni puntata × (limite / somma), arrotondata per difetto
// a CONFIG.arrotondamentoRidotte. Se qualcuna scende sotto CONFIG.puntataMinima esce, tra quelle,
// la giocata col value più basso e si ricalcola sulle restanti. Conti in centesimi interi:
// la somma finale non supera mai il limite. `giocate` è già per value decrescente.
function riduciAlLimite(giocate, { limite, motivo, bankroll, scarta }) {
  const limiteCent = Math.floor(limite * 100 + EPS);
  const passo = centesimi(CONFIG.arrotondamentoRidotte);
  const minimo = centesimi(CONFIG.puntataMinima);
  let restanti = giocate;
  for (;;) {
    const sommaCent = restanti.reduce((a, g) => a + centesimi(g.puntata.euro), 0);
    // Sotto il limite (o limite non numerico, come prima): puntate invariate.
    if (!(sommaCent > limiteCent)) return restanti;
    const ridotte = restanti.map((g) => {
      const quota = Math.floor((centesimi(g.puntata.euro) * Math.max(0, limiteCent)) / sommaCent);
      return { g, cent: Math.floor(quota / passo) * passo };
    });
    const sotto = ridotte.filter((r) => r.cent < minimo);
    if (!sotto.length) {
      return ridotte.map(({ g, cent }) => {
        const euro = cent / 100;
        const percentuale = Math.round((euro / bankroll) * 10000) / 100;
        return { ...g, puntata: { ...g.puntata, euro, percentuale, ridotta: { da: g.puntata.euro, motivo } } };
      });
    }
    // A parità di value esce quella che viene dopo nell'ordine.
    const peggiore = sotto.reduce((a, b) => (b.g.value <= a.g.value ? b : a)).g;
    scarta(peggiore.id, `puntata ridotta sotto il minimo (${motivo})`);
    restanti = restanti.filter((g) => g !== peggiore);
  }
}
