// Costanti del documento di progetto. Oggetto congelato in profondità.
const congela = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') congela(v);
  return Object.freeze(o);
};

export const CONFIG = congela({
  fusoOrario: 'Europe/Rome',
  bankrollIniziale: 200,
  stopSettimanale: -50,
  sogliaValue: 0.05,
  sogliaValueSpeciali: 0.10,
  // Estremi inclusi, tranne il minimo della speciale: 3.00 esatto è una singola,
  // la speciale è oltre 3.00 (> 3.00) fino a 4.50.
  quote: {
    singola: { min: 1.60, max: 3.00 },
    speciale: { min: 3.00, max: 4.50 },
    multipla: { min: 2.50, max: 6.00, minGamba: 1.40, gambeMin: 2, gambeMax: 4 },
    builder: { min: 3.00, max: 8.00 },
  },
  // Puntate in % del bankroll.
  puntate: {
    singola: { min: 1, max: 3 },
    speciale: { min: 1, max: 1 },
    multipla: { min: 0.5, max: 1 },
    builder: { min: 0.5, max: 0.5 },
  },
  kelly: 0.25,
  arrotondamentoEuro: 0.50,
  tettoGiornaliero: 0.12,
  massimiGiornalieri: { singole: 10, multiple: 2, builder: 2 },
  oreScadenzaSegnatura: 24,
});
