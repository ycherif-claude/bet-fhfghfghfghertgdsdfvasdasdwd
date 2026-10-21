# Automazione scommesse – Documento di progetto

*Data: 19 ottobre 2026 · Stato: approvato dall'utente*

Legenda: le parti segnate **[scelta di Claude]** sono decisioni prese da Claude e non chieste esplicitamente dall'utente; possono essere cambiate.

---

## 1. Scopo e motivazione

L'utente scommette su **bet365** su calcio, tennis, NBA, basket (europeo/internazionale) e pallavolo. Oggi analizza a mano statistiche, xG, infortuni, cambi di dirigenza, obiettivi stagionali, rendimento annuale e recente, meteo.

Vuole un sistema automatico che ogni giorno:
1. raccolga il palinsesto delle competizioni principali di ogni sport,
2. stimi le probabilità degli eventi e le confronti con le quote per trovare **value** (quota più alta di quanto dovrebbe essere),
3. proponga giocate su **qualsiasi mercato**, non solo quelli principali,
4. si aggiorni prima di ogni partita con le **formazioni ufficiali** (o l'equivalente per lo sport),
5. mostri tutto su una **pagina web**,
6. tenga uno **storico** per capire se il metodo funziona davvero.

**Aspettativa realistica, condivisa con l'utente:** nessun modello garantisce vincite. L'obiettivo è trovare poche giocate con value positivo, gestire il rischio e misurare i risultati nel tempo.

## 2. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- Analisi giornaliera automatica, senza intervento dell'utente, che parte ogni mattina alle **08:00 (ora italiana)**.
- Un controllo **per ogni partita** in cui ci sono giocate proposte, appena escono le formazioni ufficiali o l'equivalente.
- Una pagina web leggibile da telefono e da computer.
- Puntate calcolate rispettando il bankroll e i limiti di perdita.
- Uno storico con esiti e guadagni, diviso per sport, tipo di giocata e mercato.

**Non-obiettivi (per ora)**
- Piazzare scommesse in automatico su bet365: le gioca sempre l'utente a mano.
- Notifiche push: si potranno aggiungere in seguito.
- Servizi di dati a pagamento: si useranno quando lo storico mostrerà un guadagno stabile.

**Anti-obiettivi (anche se funziona, è un fallimento se...)**
- Propone giocate "per riempire la giornata" senza value reale.
- Ignora lo stop settimanale o il tetto giornaliero.
- Mostra quote o formazioni vecchie come se fossero aggiornate, senza dire da dove vengono e di quando sono.
- Non permette di capire, dopo qualche settimana, se si sta guadagnando o perdendo e perché.

## 3. Vincoli

- **Esecuzione nel cloud** (decisione dell'utente): il computer dell'utente non deve restare acceso.
- **Costo dei dati: zero** per adesso. Solo fonti gratuite: piani gratuiti di API, siti pubblici e ricerca web. Questo limita quanto in profondità si possono analizzare le partite (vedi §6.3).
- **Le quote bet365 non sono leggibili in automatico.** Si prendono da siti o API di confronto quote. Per ogni giocata si mostra una **quota minima**: l'utente controlla su bet365 e gioca solo se la quota è uguale o più alta.
- **Abbonamento Claude**: l'utente dice di usarlo solo per questo progetto e ha chiesto esplicitamente di non raggruppare i controlli prima delle partite.
- **Lingua**: tutto in italiano (pagina, motivazioni, messaggi).
- **Abbonamento Claude Pro**: le esecuzioni automatiche giornaliere nel cloud sono limitate e non bastano per un'analisi di Claude a ogni partita. Da qui la soluzione ibrida descritta sotto.
- **Account GitHub**: l'utente ce l'ha. Si usa per il codice, per i processi pianificati gratuiti (per esempio GitHub Actions) e per pubblicare la pagina.
- **Pagina senza password** (decisione dell'utente). Per evitare che estranei la trovino, l'indirizzo è difficile da indovinare e non viene indicizzato dai motori di ricerca. Il pulsante "Giocata" non deve permettere a chiunque di scrivere dati senza alcun controllo: il builder sceglie una protezione minima che non richieda login (per esempio un codice segreto salvato una volta nel browser dell'utente). **[scelta di Claude]**

### Architettura ibrida [scelta di Claude, dovuta al piano Pro]
- **Claude** (routine nel cloud) fa il **giro del mattino delle 08:00**, cioè l'analisi completa, e i **ricalcoli** quando serve.
- **Un programma leggero e gratuito** (processo pianificato su GitHub) esegue **tutti i controlli prima delle partite**, uno per ogni partita come chiesto dall'utente: scarica formazioni, infortuni e quote e li confronta con le ipotesi del mattino.
  - Se non cambia niente di rilevante, conferma la giocata da solo.
  - Se qualcosa cambia (un titolare assente, una quota sotto la minima, un ritiro), segna la scheda come "in revisione" e attiva Claude per rifare l'analisi di quella partita, nei limiti del piano.
  - Se i limiti del piano sono esauriti, applica regole semplici e scritte in anticipo (per esempio: titolare chiave fuori → giocata annullata) e lo dichiara sulla scheda.
- Gli esiti delle partite li raccoglie il programma leggero.

## 4. Sport e competizioni

**[scelta di Claude, approvata dall'utente con un'aggiunta]**

| Sport | Competizioni |
|---|---|
| **Calcio** | Champions League, Europa League, Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira Liga, Championship; **seconde divisioni delle top 5** (aggiunta dell'utente): Serie B, Segunda División, 2. Bundesliga, Ligue 2; nazionali durante le pause |
| **Tennis** | Slam, ATP Masters 1000, ATP 500, WTA 1000, WTA 500, ATP Finals, Coppa Davis, Billie Jean King Cup |
| **NBA** | Stagione regolare e playoff |
| **Basket** | Eurolega, Eurocup, ACB (Spagna), Serie A (Italia), BSL (Turchia), Lega greca, BBL (Germania), LNB (Francia), Lega adriatica (ABA), NBL (Australia) |
| **Pallavolo** (maschile e femminile) | Superlega, Serie A1 femminile, PlusLiga (Polonia), CEV Champions League, Bundesliga, Liga turca; in estate VNL e Mondiali |

Nei campionati minori (seconde divisioni) i dati avanzati come gli xG sono meno completi: lì si dà più peso a rendimento, calendario e infortuni.

## 5. Cosa si analizza

### 5.1 Fattori indicati dall'utente
Statistiche, xG, infortuni, cambi di dirigenza o allenatore, obiettivi stagionali, rendimento annuale e recente, meteo.

### 5.2 Fattori aggiunti [scelta di Claude, approvati dall'utente]
**Per tutti gli sport**
- Movimento delle quote nelle ore prima della partita.
- Confronto con una quota di riferimento "precisa" (per esempio Pinnacle), per stimare la probabilità reale e verificare il value.
- Calendario e stanchezza: partite ravvicinate, trasferte, coppe infrasettimanali, turnover.
- Motivazioni: derby, salvezza, titolo, ultime giornate.
- Scontri diretti, con peso basso.

**Calcio**: arbitro (cartellini, rigori, falli), stile di gioco (pressing, possesso, tiri, angoli, falli), rendimento casa/trasferta, gol per tempo.
**Tennis**: superficie e rendimento su quella superficie, statistiche al servizio e in risposta, tie-break, palle break, fatica dai turni precedenti, ritiri recenti.
**NBA / basket**: back-to-back, minuti dei titolari, ritmo di gioco, rating offensivo e difensivo ogni 100 possessi, statistiche individuali.
**Pallavolo**: attacco, muro, ace ed errori al servizio, rendimento set per set.

### 5.3 Calcolo del value
- Per ogni mercato considerato si stima una probabilità.
- Value = probabilità stimata × quota − 1.
- Una giocata entra solo con **value ≥ 5%** (≥ 10% per le singole "speciali", vedi §7.2).
- Il metodo di stima per ogni sport e mercato lo decide il builder (vedi §11). Deve però essere spiegabile in 3-4 fattori principali, mostrati sulla scheda.
- **Mercati senza quote gratuite** (angoli, cartellini, tiri, marcatori, statistiche dei giocatori, bet builder) **[scelta di Claude]**: la giocata si propone lo stesso. Si calcola la quota "giusta" dalla probabilità stimata e si mostra come quota minima la quota giusta × 1,05 (× 1,10 per singole speciali e bet builder). La scheda è segnata **"quota da verificare su bet365"**: l'utente gioca solo se bet365 paga almeno la quota minima. Nello storico queste giocate sono tenute separate, così si vede se la stima è affidabile.

## 6. Flusso giornaliero

### 6.1 Giro del mattino – 08:00
1. Si raccoglie il palinsesto della giornata (dalle 08:00 alle 07:59 del giorno dopo, così entrano le partite NBA notturne) per le competizioni del §4. **[scelta di Claude]**
2. Prima scrematura con i dati più economici (quote, classifica, forma): si scelgono le partite più promettenti.
3. Analisi approfondita di quelle partite con i fattori del §5.
4. Si generano le giocate secondo le regole del §7 e si pubblicano sulla pagina con stato **"In attesa formazioni"**.
5. Si calcola il bankroll aggiornato e si verificano lo stop settimanale e il tetto giornaliero.

### 6.2 Controllo prima di ogni partita
Ogni partita con almeno una giocata proposta ha **un suo controllo** (niente raggruppamenti, decisione dell'utente). Orari indicativi:

| Sport | Quando | Cosa si controlla |
|---|---|---|
| Calcio | ~45 min prima (le formazioni escono circa 60 min prima) | Formazioni ufficiali, assenze dell'ultimo momento, meteo, movimento quote |
| NBA / basket | Report infortuni nel pomeriggio + ~30 min prima | Infortuni, quintetti titolari, movimento quote |
| Tennis | ~45 min prima | Ritiri, condizioni fisiche, meteo (all'aperto), movimento quote |
| Pallavolo | ~45 min prima | Formazioni se disponibili, altrimenti notizie e movimento quote |

Esito del controllo: la giocata passa a **Confermata**, **Modificata** (nuova quota minima, nuovo mercato o nuova puntata) oppure **Annullata**, sempre con il motivo scritto. Il controllo può anche aggiungere una giocata nuova, se le formazioni creano value prima inesistente. **[scelta di Claude]**

Se le formazioni non sono ancora uscite all'ora del controllo, si riprova più vicino all'inizio. Se non escono, la scheda lo segnala e la giocata resta valutata solo sui dati del mattino. **[scelta di Claude]**

### 6.3 Limiti dovuti ai dati gratuiti
- Le API gratuite hanno limiti di richieste giornaliere: il giro del mattino deve restare nei limiti e scremare prima di approfondire.
- Le formazioni ufficiali, soprattutto nei campionati minori e nella pallavolo, possono non essere disponibili gratis o arrivare tardi.
- Ogni dato mostrato riporta la fonte e l'ora in cui è stato raccolto.
- **Priorità se i dati gratuiti non bastano per tutto [scelta di Claude]**: 1) calcio, campionati top 5 e coppe europee; 2) NBA; 3) tennis (Slam e 1000); 4) resto del calcio; 5) basket europeo; 6) pallavolo. Le competizioni non coperte in un giorno vengono indicate sulla pagina.

### 6.4 Esiti
Gli esiti delle partite vengono raccolti in automatico (al giro del mattino successivo o prima) e lo storico si aggiorna. **[scelta di Claude]**

## 7. Regole di gioco

### 7.1 Tipi di giocata (l'utente li vuole tutti e tre)
- **Singole**: la base.
- **Multiple**: costruite **solo** combinando singole che hanno già value. 2-4 partite, ognuna con quota ≥ 1,40.
- **Bet builder**: solo se la combinazione risulta sottovalutata secondo il calcolo, tenendo conto che gli eventi della stessa partita sono collegati tra loro. Pochi.

### 7.2 Range di quote [scelta di Claude, chiesto dall'utente]
| Tipo | Range |
|---|---|
| Singole | 1,60 – 3,00 |
| Singole "speciali" | 3,00 – 4,50, solo con value ≥ 10% e puntata 1% |
| Multiple | quota totale 2,50 – 6,00 |
| Bet builder | 3,00 – 8,00 |

Nessuna singola sotto 1,60.

### 7.3 Mercati [scelta di Claude, delegata dall'utente]
Si valutano tutti i mercati stimabili con i dati disponibili. Esempi:
- **Calcio**: 1X2, doppia chance, handicap asiatici ed europei, under/over (totali, per squadra, per tempo), gol/no gol, angoli, cartellini, tiri, marcatori, risultato esatto, primo tempo/finale.
- **Tennis**: vincente, handicap game e set, totale game, risultato esatto in set, tie-break sì/no.
- **NBA / basket**: spread, totali (partita, squadra, quarto), punti/rimbalzi/assist dei giocatori.
- **Pallavolo**: vincente, handicap set e punti, totale punti, risultato esatto in set.

**Una sola singola per partita**, quella col value più alto. Le multiple e i bet builder possono riusare partite già presenti tra le singole.

**Apprendimento**: dopo circa un mese di storico, i mercati che perdono con costanza vengono ridotti o tolti, e la modifica viene segnalata all'utente sulla pagina.

### 7.4 Quante giocate
Nessun numero fisso: decide la soglia di value. Nelle giornate normali ci si aspettano 3-8 singole. Tetto massimo al giorno: **10 singole, 2 multiple, 1-2 bet builder**. Se non c'è niente con value, la pagina lo dice e non propone giocate.

## 8. Bankroll e rischio

- **Bankroll iniziale: 200 €** (decisione dell'utente).
- **Stop settimanale: −50 €** (decisione dell'utente). La settimana va da lunedì a domenica. Raggiunto lo stop, non si propongono altre giocate fino al lunedì dopo e la pagina lo segnala chiaramente.
- **Puntate [scelta di Claude]**, calcolate con una versione prudente (frazionaria) del criterio di Kelly, entro questi limiti:
  - singole: 1-3% del bankroll (2-6 € all'inizio);
  - singole speciali: 1%;
  - multiple: 0,5-1%;
  - bet builder: 0,5%.
- **Tetto giornaliero [scelta di Claude]**: al massimo il 10-12% del bankroll in gioco nello stesso giorno.
- **Puntate ridotte in proporzione [decisione dell'utente]**: se le giocate valide del giorno chiedono più del limite (il residuo del tetto giornaliero o, se più piccola, la distanza dallo stop settimanale), non si scarta nessuna giocata: tutte le puntate si riducono nella stessa proporzione (limite / somma delle puntate), arrotondate per difetto a 0,10 €, e la percentuale si ricalcola. Così si giocano più partite e si raccolgono più dati con lo stesso rischio massimo. La somma non supera mai il limite.
  - Puntata minima **1 €**: se dopo la riduzione qualche puntata è sotto 1 €, esce la giocata con il value più basso tra quelle sotto il minimo (motivo "puntata ridotta sotto il minimo (tetto giornaliero)" o "(stop settimanale)") e si ricalcola sulle restanti.
  - La scheda dice "ridotta da X € per il tetto giornaliero" (o "per lo stop settimanale"). Vale anche per le giocate aggiunte la sera (tennis), con i residui di quel momento: la giocata che non entra intera viene ridotta, non scartata, se resta almeno 1 €.
- Le puntate si ricalcolano ogni giorno sul bankroll aggiornato.
- Gli importi si arrotondano a 0,50 € (le puntate ridotte dal tetto o dallo stop a 0,10 €). **[scelta di Claude]**

Per sapere il bankroll reale servono le giocate effettivamente fatte: vedi §9.3. Una giocata proposta ma non segnata come giocata **non** conta nel bankroll. Conta però nello storico "proposte", che misura il metodo. **[scelta di Claude]**

**Come si calcolano stop e tetto [scelta di Claude]**
- Stop settimanale e tetto giornaliero si basano sulle **giocate segnate come fatte**.
- Per prudenza, le puntate **ancora in corso** contano come se fossero già perse, sia per lo stop sia per il tetto. Così non si supera mai il limite nemmeno nel caso peggiore.
- Se ci sono giocate passate non segnate né come fatte né come saltate, la pagina mostra un promemoria in alto. Le giocate non segnate dopo 24 ore vengono considerate saltate.

## 9. Pagina web

### 9.1 Pagina del giorno – layout "A, schede per sport" (scelta dell'utente)
- In alto i filtri per sport: Calcio, Tennis, NBA, Basket, Pallavolo.
- Un riquadro con bankroll attuale, risultato della settimana, distanza dallo stop e somma già in gioco oggi rispetto al tetto. **[scelta di Claude]**
- Una scheda per ogni giocata con:
  - partita, orario, competizione;
  - tipo (singola, multipla, bet builder) e mercato;
  - quota trovata, con fonte e orario, e **quota minima** da accettare su bet365;
  - probabilità stimata, value, puntata consigliata (in € e in % del bankroll);
  - **stato**: In attesa formazioni / Confermata / Modificata / Annullata, con il motivo e l'orario dell'ultimo controllo;
  - aprendo la scheda, il **ragionamento** in breve: i 3-4 fattori principali. **[scelta di Claude]**
- Le giocate annullate restano visibili, barrate, con il motivo.
- La pagina deve funzionare bene sul telefono.

### 9.2 Pagina storico [scelta di Claude]
- Elenco delle giocate passate con esito e guadagno o perdita.
- Riepiloghi per sport, tipo di giocata e mercato: numero di giocate, percentuale di vincita, profitto, ROI.
- Due viste separate: **giocate fatte davvero** (soldi reali) e **tutte le proposte** (qualità del metodo).
- Andamento del bankroll nel tempo.

### 9.3 Pulsante "Giocata" (approvato dall'utente)
Su ogni scheda c'è un pulsante **"Giocata"**: l'utente lo preme e inserisce la **quota presa davvero** su bet365 e la **puntata reale** (precompilata con quella consigliata). Queste informazioni devono essere salvate in modo duraturo e lette dal sistema al giro successivo per calcolare il bankroll. Deve essere possibile annullare una segnatura sbagliata. **[scelta di Claude]**

## 10. Idee per dopo (non nella prima versione)
- Notifiche (per esempio Telegram) quando una giocata cambia stato.
- Un servizio di quote a pagamento, il primo da prendere quando lo storico mostrerà un guadagno stabile.
- Statistiche avanzate a pagamento (xG completi, dati giocatori).

## 11. Lasciato al builder
- Dettagli tecnici dell'architettura ibrida (§3): come vengono programmati i controlli per ogni partita, dove sta la pagina (per esempio GitHub Pages) e dove sono salvati i dati, compreso il salvataggio duraturo del pulsante "Giocata". Prima di partire va verificato il numero esatto di esecuzioni giornaliere permesse dal piano Pro.
- Quali cambiamenti contano come "rilevanti" per attivare Claude, e le regole di riserva per quando i limiti del piano sono esauriti.
- Scelta delle fonti gratuite specifiche per palinsesti, quote, statistiche, formazioni ed esiti, nel rispetto dei termini d'uso dei siti.
- Modelli di stima delle probabilità per ogni sport e mercato (per esempio Poisson per i gol, modelli Elo per il tennis, modelli basati su ritmo ed efficienza per il basket), purché spiegabili in pochi fattori.
- Come gestire errori e fonti che non rispondono. Requisito minimo: un giro fallito deve essere visibile sulla pagina, mai silenzioso.
- Aspetto grafico della pagina, nel rispetto del layout A.
