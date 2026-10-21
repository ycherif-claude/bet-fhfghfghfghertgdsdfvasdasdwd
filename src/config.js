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
  // Fase 2 (calcio): soglie del modello e della raccolta dati.
  calcio: {
    pesoPinnacle: 0.5,
    scartoMaxPinnacle: 0.10,
    correzioneMax: 0.08,
    probMin: 0.02,
    probMax: 0.98,
    scostamentoMinSenzaQuota: 0.10,
    maxSenzaQuotaGiorno: 2,
    maxMercatiPartita: 5,
    riservaCrediti: 0.20,
    mezzaVitaGiorni: 182,
    pesoXg: 0.5,
    minBookmaker: 3,
    minPartiteArbitro: 5,
    ripetizioni: 2,
    rho: -0.08,
    golMaxMatrice: 10,
  },
  // Fase 4a (NBA): soglie del modello, della raccolta e della routine serale.
  nba: {
    mezzaVitaGiorni: 30,
    regressioneStagione: 1 / 3,
    minPartiteStagione: 10,
    pesoModello: 0.5,
    pesoModelloInizio: 0.25,
    backToBack: -1.5,
    sdMargine: 12.5,
    sdTotale: 18,
    minBookmaker: 3,
    attesaBalldontlieMs: 13000,
    ricercheMassime: 20,
    oraSerale: '22:00',
    sogliaAnticipo: '22:30',
    anticipoMinuti: 60,
    serale: { oraMinima: '14:00', ritardoAvvisoOre: 2 },
  },
  // Fase 4b (tennis): Elo per superficie, soglie del modello e crediti per torneo.
  tennis: {
    eloIniziale: 1500,
    kBase: 250,
    kOffset: 5,
    kEsponente: 0.4,
    pesoSuperficie: 0.5,
    pesoModello: 0.5,
    pesoModelloPocheDati: 0.25,
    minPartite12Mesi: 20,
    minBookmaker: 3,
    creditiPerTorneo: 1,
    riservaSeraPerTorneo: 1,
    // Partite su una superficie (del giocatore che ne ha meno) oltre le quali l'Elo di superficie pesa per intero.
    partiteSuperficiePiena: 20,
  },
  // Fase 4c (basket: Eurolega e NBL): modello NBA con costanti proprie, quote da The Odds API.
  basket: {
    // Circa due partite a settimana: la mezza vita copre più partite che nell'NBA.
    mezzaVitaGiorni: 60,
    regressioneStagione: 1 / 3,
    minPartiteStagione: 8,
    pesoModello: 0.5,
    pesoModelloInizio: 0.25,
    // Doppio turno (seconda partita in 3 giorni): −1 punto di margine alla squadra stanca.
    backToBack: -1,
    giorniDoppioTurno: 2,
    sdMargine: 11,
    sdTotale: 15,
    mediaPuntiIniziale: 82,
    minPartiteSd: 60,
    // Partite salvate (tutte le stagioni) sotto le quali una squadra non ha modello: solo mercato.
    minPartiteModello: 8,
    minBookmaker: 3,
    // h2h, spreads e totals in una regione: 3 crediti per campionato.
    creditiPerCampionato: 3,
  },
});
