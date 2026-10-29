// Costanti del documento di progetto. Oggetto congelato in profondità.
const congela = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') congela(v);
  return Object.freeze(o);
};

export const CONFIG = congela({
  fusoOrario: 'Europe/Rome',
  bankrollIniziale: 200,
  // Stop settimanale (−50 €) tolto dall'utente il 21/10/2026: nessun limite settimanale.
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
  // Giocate del giorno oltre il tetto: tutte ridotte in proporzione, arrotondate per difetto a 0,10 €;
  // se anche una sola scenderebbe sotto la puntata minima (€), per oggi il tetto non vale e tutte
  // le giocate vanno a puntata fissa di questo importo ("giornata piena") [utente, 21/10/2026].
  puntataMinima: 1.00,
  arrotondamentoRidotte: 0.10,
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
    // Vincente dal modello: spento finché l'Elo non è tarato (non ancora confrontato con i risultati,
    // tende a spingere verso le sfavorite). Per ora il vincente usa solo il mercato [utente, 21/10/2026].
    vincenteDalModello: false,
    pesoModello: 0.5,
    pesoModelloInizio: 0.25,
    minBookmaker: 3,
    richiesteMese: 250,
    riservaRichieste: 0.20,
    // OddsPapi: 2 s di pausa obbligatoria su /fixtures, 0,5 s su /odds.
    pausaOddsPapiMs: 2100,
    // TheSportsDB [correzioni 24/10/2026, punto 7]: il 23 e il 24/10 HTTP 429 con 6,5 s di pausa e fino a 12 giornate
    // per campionato (60 richieste). Ora 12 s fra una richiesta e l'altra (5 al minuto), al massimo 15 giornate per
    // esecuzione fra tutti i campionati (prima le stagioni in corso) e, dopo un 429, basta fino alla raccolta del giorno
    // dopo, che riprende dall'ultima giornata salvata.
    pausaTheSportsDbMs: 12000,
    maxGiornateEsecuzione: 15,
    // Stagione in corso: al massimo 3 giornate per campionato a esecuzione (5 campionati × 3 = 15), così tutti la
    // aggiornano; le giornate che avanzano vanno alle stagioni precedenti.
    maxGiornateCampionato: 3,
  },
  // Modalità prova [utente, 22/10/2026]: 3-4 settimane di giocate da non giocare, solo per creare il
  // database della taratura. Ogni value positivo diventa una giocata di prova, senza lo scarto dal mercato.
  prova: { da: '2026-10-22', fino: '2026-11-18', sogliaValue: 0.000001, massimiSingole: 60 },
  // Coppe europee (modello Elo europeo) [correzione B3]: le giocate del modello coppe restano solo in modalità
  // prova. Dopo la prova non diventano giocate vere finché l'utente non mette giocateVere: true.
  coppe: { giocateVere: false },
  // Multiple bonus bet365 (in prova dal 22/10/2026): partite a quota 1,25–1,50 con il margine più basso,
  // una selezione per partita. Incremento sulla vincita dalla tabella ufficiale di bet365 (screenshot dell'utente):
  // ogni selezione deve avere quota ≥ 1,25 e nessun mercato che possa finire rimborsato.
  // Pronostici sì/no [utente, 22/10/2026]: nascono solo dal modello, senza quote; la quota serve dopo,
  // per decidere se giocare (vedi margineQuota). "Sì" quando la probabilità del modello supera la soglia
  // del mercato. Soglie scelte sulle stagioni passate (data/taratura/calibrazione.json): da lì in su il "sì"
  // è uscito almeno il 70% circa delle volte in ogni stagione. Gol, No gol, Under 1.5/2.5 e Over 3.5 esclusi:
  // il modello li sopravvaluta. La percentuale mostrata è quella vera della stessa fascia nel passato.
  pronostici: {
    // Solo i mercati scelti dall'utente [22/10/2026]: 1X2, doppia chance, Over 1.5, gol casa, gol ospite.
    // Tutti i "sì" della partita (al massimo 10), senza tennis.
    maxPerPartita: 10,
    minCampioniFascia: 60,
    // Un "sì" solo se nel passato quella fascia è uscita almeno l'80% delle volte [utente, 22/10/2026]:
    // la soglia vale per il limite inferiore di Wilson (95%) della fascia, dopo la regressione isotonica,
    // nella tabella del gruppo della competizione (principali, seconde serie, extra, coppe) [correzioni B1, B2].
    probMinima: 0.8,
    // Segnale "giocabile ✅" [22/10/2026, correzione C2]: solo se anche la probabilità senza margine di
    // Pinnacle (o del consenso) è ≥ probMinima e la quota è ≥ margineQuota × quota minima. Il modello da solo
    // perde contro Pinnacle (backtest): una quota "alta" di solito vuol dire che il mercato non è d'accordo.
    margineQuota: 1.05,
    // Doppie e triple di pronostici [utente, 22/10/2026, idea 4]: dai pronostici migliori di partite diverse,
    // fino a `max` schedine da 2 o 3 pronostici con quota totale fra quotaMin e quotaMax.
    // Una gamba senza risultato dopo giorniRimborso giorni (partita rinviata o sospesa) è rimborsata, come nelle multiple bonus.
    schedine: { max: 3, gambeMin: 2, gambeMax: 3, quotaMin: 1.5, quotaMax: 2, giorniRimborso: 3 },
    soglie: {
      calcio: {
        '1X2|1': 0.7,
        '1X2|2': 0.7,
        'Doppia chance|1X': 0.7,
        'Doppia chance|X2': 0.7,
        // 12: sotto l'80% del modello esce quanto una partita qualsiasi (74% nei campionati, 79% nelle coppe).
        'Doppia chance|12': 0.8,
        'Under/Over 1.5|Over 1.5': 0.7,
        'Under/Over casa 0.5|Over 0.5': 0.75,
        'Under/Over trasferta 0.5|Over 0.5': 0.75,
      },
    },
  },
  // Idea 1 [utente, 22/10/2026]: quote dei bookmaker italiani dell'utente da odss-api.com (piano gratuito:
  // 500 richieste ogni 30 giorni, 30 al minuto). Dal 22/10/2026 odss-api è la fonte principale delle quote di tutti
  // gli sport (calcio, tennis, basket, NBA, pallavolo) e dei controlli; le fonti di prima restano di riserva.
  // Budget per sport [correzioni 24/10/2026, punto 2] (data/stato/odss.json): ogni sport del giro del mattino e i
  // controlli hanno il loro tetto al giorno (`tetti`), dentro il tetto giornaliero totale `richiesteGiorno`, che è la
  // loro somma: in qualunque ordine girino le raccolte, ognuno ha la sua quota (prima calcio, NBA e tennis finivano le
  // 10 richieste del mattino e basket e pallavolo restavano senza). Mai sotto `riserva` richieste rimaste.
  // Uno sport senza partite oggi non fa richieste. Al massimo 13 × 30 = 390 richieste in 30 giorni (sotto le 440
  // spendibili); consumo atteso più basso (README, "Budget di odss-api").
  odss: {
    richiesteGiorno: 13,
    tetti: { calcio: 4, nba: 2, tennis: 1, basket: 1, pallavolo: 1, controlli: 4 },
    riserva: 60,
    // Righe per pagina: 5000, il massimo dell'API, per tutti gli sport (con 1000 NBA e tennis finivano in 2 pagine e
    // il 23/10 l'NBA è rimasta con le quote incomplete).
    limite: 5000,
    // Calcio mirato: event_id per richiesta nel completamento (dc e ou fanno ~40 righe a partita: 100 partite stanno
    // in una pagina da 5000 righe e l'indirizzo resta corto).
    eventiPerRichiesta: 100,
    // Pinnacle aggiornato da più di tante ore: ignorato, vale il consenso dei bookmaker.
    oreMaxPinnacle: 24,
    // Linee dell'Under/Over salvate (i pronostici usano l'Over 1.5).
    lineeOu: [1.5, 2.5, 3.5],
    // Bookmaker su cui l'utente ha un conto (Betfair non c'è su odss-api; bet365 di solito senza prematch).
    miei: ['bet365', 'snai', 'goldbet', 'sportium', 'daznbet'],
    // Partita odss ↔ partita della giornata: stesse squadre e inizio entro tante ore.
    toleranzaOre: 2,
    // Quote dei bookmaker dell'utente aggiornate da più di tante ore (al momento del download): ignorate.
    oreMaxQuota: 6,
    // Un bookmaker che dà per la partita un orario d'inizio diverso di più di tante ore (start_time): fuori.
    toleranzaInizioOre: 1,
  },
  multiplaBonus: {
    quotaMin: 1.25,
    quotaMax: 1.5,
    // Correzione C1: bet365 di solito paga meno della mediana. Senza la quota bet365 la mediana deve essere
    // ≥ 1,30 (margine per arrivare a 1,25 su bet365); con la quota bet365 basta che quella sia ≥ 1,25.
    quotaMinMediana: 1.3,
    quotaMinBet365: 1.25,
    // Gamba senza risultato dopo 3 giorni (partita rinviata o sospesa): rimborsata, come fa bet365.
    giorniRimborso: 3,
    lunghezze: [10, 20],
    // Multiple con le partite più probabili (non per margine) [utente, 29/10/2026].
    lunghezzeProbabilita: [5, 10],
    incremento: { 2: 0.025, 3: 0.05, 4: 0.075, 5: 0.1, 6: 0.125, 7: 0.18, 8: 0.25, 9: 0.3, 10: 0.35, 11: 0.4, 12: 0.45, 13: 0.5, 14: 0.55, 15: 0.6, 16: 0.65, 17: 0.7, 18: 0.8, 19: 0.9, 20: 1 },
  },
  // Coppie a quota 2 [utente, 29/10/2026]: due partite della multipla bonus con quota totale in questo intervallo.
  coppieQuota2: { quotaMin: 1.9, quotaMax: 2.15 },
  // Fase 3 (controlli prima delle partite): finestre in minuti prima dell'inizio, soglie e tetti.
  controlli: {
    // Il cron "ogni 10 minuti" di GitHub parte in realtà ogni 30-43 minuti: la finestra è larga
    // abbastanza da contenere sempre un passaggio, e "ultimo" (si decide con quello che c'è)
    // comincia 45 minuti prima, così l'ultimo passaggio prima dell'inizio decide sempre.
    finestre: {
      calcio: { primo: 90, ultimo: 45 },
      tennis: { primo: 90, ultimo: 45 },
      pallavolo: { primo: 90, ultimo: 45 },
      nba: { primo: 75, ultimo: 45 },
      basket: { primo: 75, ultimo: 45 },
    },
    // Avvii al giorno della routine Claude "Controllo pre-partita" [utente: 2].
    maxClaude: 2,
    // Una giocata ancora in revisione a meno di questi minuti dall'inizio passa alle regole fisse:
    // con il cron irregolare quel passaggio può essere l'ultimo prima della partita.
    minutiRegoleFisse: 45,
    // Pinnacle (o il consenso) contro di più di questi punti di probabilità → revisione.
    scartoMercato: 0.05,
    // Crediti di The Odds API e richieste OddsPapi da non toccare mai per i controlli.
    minCreditiOdds: 25,
    minRichiesteOddsPapi: 25,
    // Partita riconosciuta sulle fonti se l'orario differisce al massimo di tante ore.
    toleranzaOre: 3,
  },
});
