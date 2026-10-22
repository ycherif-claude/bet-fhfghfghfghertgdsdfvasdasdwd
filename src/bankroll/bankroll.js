import { CONFIG } from '../config.js';
import { inizioSettimana, giornataDi } from './settimana.js';

const ORA_MS = 3600000;

function profitto(sig, esito) {
  if (esito === 'vinta') return sig.puntataReale * (sig.quotaReale - 1);
  if (esito === 'persa') return -sig.puntataReale;
  return 0; // rimborsata
}

// Arrotonda ai centesimi per evitare errori di virgola mobile.
const cent = (n) => Math.round(n * 100) / 100;

// Giocate di una giornata: se la giornata è di prova (`prova: true`, anche quelle scritte prima del
// campo per giocata) valgono come prova tutte le sue giocate.
export function giocateConProva(giornata, giocate = giornata?.giocate) {
  const lista = Array.isArray(giocate) ? giocate : [];
  return giornata?.prova === true ? lista.map((g) => (g && typeof g === 'object' ? { ...g, prova: true } : g)) : lista;
}

// Le giocate di prova (`prova: true`) non contano mai: né da segnare, né bankroll, né tetto, né settimana.
// Se una è segnata come fatta per errore, `avvisi` lo dice.
export function statoBankroll(giocate, segnature, adesso) {
  const ultima = new Map();
  for (const s of segnature) {
    const prec = ultima.get(s.idGiocata);
    if (!prec || Date.parse(s.ora) >= Date.parse(prec.ora)) ultima.set(s.idGiocata, s);
  }
  const t = adesso.getTime();
  const settimana = inizioSettimana(adesso);
  const oggi = giornataDi(adesso);

  let bankroll = CONFIG.bankrollIniziale;
  let risultatoSettimana = 0;
  let inGiocoOggi = 0;
  const daSegnare = [];
  const avvisi = [];

  for (const g of giocate) {
    const sig = ultima.get(g.id);
    if (g.prova === true) {
      if (sig?.fatta) avvisi.push(`Giocata di PROVA ${g.id} segnata come fatta: non conta nel bankroll (se è un errore annulla la segnatura)`);
      continue;
    }
    const inizio = Date.parse(g.inizio);
    if (!sig) {
      const trascorso = t - inizio;
      if (g.stato !== 'annullata' && trascorso >= 0 && trascorso < CONFIG.oreScadenzaSegnatura * ORA_MS) {
        daSegnare.push(g.id);
      }
      continue;
    }
    if (!sig.fatta) continue;
    const inSettimana = inizioSettimana(new Date(inizio)) === settimana;
    if (g.esito) {
      const p = profitto(sig, g.esito);
      bankroll += p;
      if (inSettimana) risultatoSettimana += p;
    } else if (giornataDi(new Date(inizio)) === oggi) {
      // In corso: conta per il tetto giornaliero, non per il risultato della settimana (solo chiuse).
      inGiocoOggi += sig.puntataReale;
    }
  }

  return {
    bankroll: cent(bankroll),
    risultatoSettimana: cent(risultatoSettimana),
    inGiocoOggi: cent(inGiocoOggi),
    daSegnare,
    avvisi,
  };
}
