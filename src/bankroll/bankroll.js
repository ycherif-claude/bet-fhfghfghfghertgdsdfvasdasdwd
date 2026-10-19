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

  for (const g of giocate) {
    const sig = ultima.get(g.id);
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
    } else {
      if (inSettimana) risultatoSettimana -= sig.puntataReale;
      if (giornataDi(new Date(inizio)) === oggi) inGiocoOggi += sig.puntataReale;
    }
  }

  bankroll = cent(bankroll);
  risultatoSettimana = cent(risultatoSettimana);
  return {
    bankroll,
    risultatoSettimana,
    inGiocoOggi: cent(inGiocoOggi),
    stopRaggiunto: risultatoSettimana <= CONFIG.stopSettimanale,
    distanzaStop: cent(risultatoSettimana - CONFIG.stopSettimanale),
    daSegnare,
  };
}
