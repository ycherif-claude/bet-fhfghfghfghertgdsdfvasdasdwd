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
  // Fase 4d (pallavolo): Elo per campionato con il margine in set, quote da OddsPapi (piano gratuito).
  pallavolo: {
    eloIniziale: 1500,
    // K e vantaggio campo scelti sulle 320 partite salvate il 21/10/2026 (errore di previsione minimo).
    k: 60,
    vantaggioCasa: 60,
    regressioneStagione: 1 / 3,
    // Partite salvate sotto le quali una squadra non ha modello (solo mercato); sotto il pieno, peso ridotto.
    // 20 e non 8: con meno partite l'Elo resta schiacciato verso il 50% e favorirebbe le sfavorite.
    minPartiteModello: 20,
    minPartitePienoPeso: 30,
    // Handicap set e totale set dal modello a set indipendenti: spenti finché non è tarato
    // (prevede l'Over 3.5 al 72%, nella realtà 53% su 320 partite). Per ora solo mercato.
    mercatiSetDalModello: false,
    pesoModello: 0.5,
    pesoModelloInizio: 0.25,
    minBookmaker: 3,
    richiesteMese: 250,
    riservaRichieste: 0.20,
    // OddsPapi: 2 s di pausa obbligatoria su /fixtures, 0,5 s su /odds.
    pausaOddsPapiMs: 2100,
    // TheSportsDB: circa 10 richieste al minuto, al massimo 12 giornate per campionato a ogni raccolta.
    pausaTheSportsDbMs: 6500,
    maxGiornateGiorno: 12,
  },
  // Fase 3 (controlli prima delle partite): finestre in minuti prima dell'inizio, soglie e tetti.
  controlli: {
    finestre: {
      calcio: { primo: 50, ultimo: 15 },
      tennis: { primo: 45, ultimo: 15 },
      pallavolo: { primo: 45, ultimo: 15 },
      nba: { primo: 35, ultimo: 10 },
      basket: { primo: 35, ultimo: 10 },
    },
    // Avvii al giorno della routine Claude "Controllo pre-partita" [utente: 2].
    maxClaude: 2,
    // Senza una decisione di Claude entro questi minuti dall'inizio valgono le regole fisse.
    minutiDecisioneClaude: 5,
    // Pinnacle (o il consenso) contro di più di questi punti di probabilità → revisione.
    scartoMercato: 0.05,
    // Crediti di The Odds API e richieste OddsPapi da non toccare mai per i controlli.
    minCreditiOdds: 25,
    minRichiesteOddsPapi: 25,
    // Partita riconosciuta sulle fonti se l'orario differisce al massimo di tante ore.
    toleranzaOre: 3,
  },
});
