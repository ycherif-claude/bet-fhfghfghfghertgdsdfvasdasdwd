# Fase 2 – Dati del calcio, modelli e giro del mattino

*Data: 19 ottobre 2026 · Stato: bozza da approvare*

Parte da `docs/progetto-automazione-scommesse.md` (approvato) e dal README, sezione "Per chi sviluppa". Il formato dei file, i valori di `sport` e le regole in `src/regole` e `src/bankroll` sono vincolanti e non si cambiano.

Legenda: **[utente]** = deciso dall'utente in questa conversazione; **[scelta di Claude]** = deciso da Claude, modificabile.

---

## 1. Scopo

Ogni giorno, senza intervento dell'utente, deve comparire sul sito la giornata del calcio con giocate reali. Le giocate vengono da un modello di probabilità spiegabile. Le notizie sono controllate da Claude, le puntate sono calcolate con `selezionaGiocate` e `statoBankroll`, e gli esiti delle giocate passate vengono registrati, così bankroll e stop restano corretti.

Successo = per un mese il file `data/giornate/AAAA-MM-GG.json` esce ogni giorno con `candidati`, `giocate` e `scartate`, le fonti e gli orari sono visibili, e un giorno fallito si vede sulla pagina.

## 2. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- Raccolta dati gratuita per tutte le competizioni di calcio del §4 del documento di progetto.
- Probabilità per i mercati **1X2, doppia chance, under/over (totale, per squadra, primo tempo), gol/no gol, risultato esatto, handicap asiatico, angoli, cartellini**. **[utente: over/under, angoli, cartellini, 1X2, gol, "anche altri"]** Tiri e marcatori sono esclusi perché con i dati gratuiti sono troppo deboli. **[scelta di Claude]**
- Giro del mattino di Claude ogni giorno alle **08:07** ora italiana (08:00 nel documento: vedi §6), che scrive e pubblica il file della giornata.
- Esiti delle giocate dei giorni precedenti scritti nei file, perché senza esiti le puntate segnate restano "in corso", contano come perse e fanno scattare lo stop per errore.

**Non-obiettivi in questa fase**
- Altri sport (Fase 4). Controlli prima della partita e formazioni (Fase 3).
- **Bet builder**: senza quote gratuite il value non si può verificare. Si aggiungono più avanti. **[scelta di Claude]**
- Apprendimento automatico dei mercati che perdono (dopo un mese di storico).

**Anti-obiettivi**
- Giocate "per riempire": in particolare le giocate con "quota da verificare" (angoli, cartellini) non devono riempire la giornata (vedi §5.4).
- Claude che cambia le probabilità a sentimento. Le notizie **possono cambiare le probabilità** **[utente, che ha cambiato la scelta iniziale "prudente"]**, ma solo per un fatto concreto con fonte e ora, entro un tetto fisso, e sempre tracciate in modo che lo storico misuri se le correzioni aiutano (§6.1). **[tetto e regole: scelta di Claude, delegata dall'utente]**
- Superare i limiti gratuiti delle API o violarne i termini d'uso.
- Un giro fallito che non lascia traccia sulla pagina.

## 3. Architettura

```
05:35 UTC (07:35 ora legale / 06:35 ora solare)   GitHub Actions "Raccolta calcio"
  1. esiti dei giorni passati  → aggiorna data/giornate/*.json (campo esito)
  2. palinsesto + quote + statistiche → modello → data/raccolta/AAAA-MM-GG.json
  3. commit e push su main (la pubblicazione del sito parte da sola)

08:07 Europe/Rome   Routine Claude "Giro del mattino" (cloud, abbonamento Pro)
  1. legge data/raccolta/AAAA-MM-GG.json
  2. controlla le notizie delle partite in gara (ricerca web)
  3. scrive data/raccolta/AAAA-MM-GG-notizie.json (correzioni ed esclusioni, con motivo e fonte)
  4. npm run giro → data/giornate/AAAA-MM-GG.json con candidati, giocate, scartate
  5. npm test, commit e push su main

09:45 UTC   GitHub Actions "Giro di riserva"
  se data/giornate/<oggi>.json non esiste, o esiste ma non è del giro di oggi:
  npm run giro --riserva → giocate solo dai numeri, ciascuna con "notizie non controllate"
```

**Perché così [scelta di Claude]**: i calcoli sono deterministici e testabili, le chiavi delle API restano nei segreti di GitHub e Claude consuma poco dell'abbonamento Pro. Inoltre l'ambiente cloud della routine non deve raggiungere nessun dominio esterno: gli bastano GitHub e la ricerca web.

**Riserva [utente: "notizie non controllate"]**: se il giro di Claude non c'è, le giocate si pubblicano lo stesso, solo dai numeri. Ogni scheda ha nel ragionamento "Notizie non controllate: giro di Claude non eseguito", e `erroriGiro` lo dice in chiaro. Il giro di riserva non sovrascrive mai un file già scritto da Claude per oggi.

**Orari GitHub**: il cron di GitHub è in UTC e può partire con ritardo. 05:35 UTC dà margine sia con l'ora legale sia con quella solare. Attenzione: alle 07:35 di Roma `giornataDi(adesso)` restituisce ancora ieri. La raccolta lavora sempre sulla giornata **che inizia alle 08:00 di oggi** (data di Roma di oggi), mentre il giro e la riserva usano la data di Roma del giorno in cui girano.

**Chi può riscrivere il file della giornata [scelta di Claude]**
- La raccolta (`data/raccolta/`) si può rifare quante volte si vuole: è un file interno.
- `data/giornate/<oggi>.json` si scrive o riscrive solo se **nessuna giocata del file attuale ha già una segnatura e nessuna partita del file è già iniziata**. In tutti gli altri casi il giro lascia il file com'è e registra in `erroriGiro` "giro <tipo> delle <ora> non applicato: giornata già in uso". Così le giocate già fatte dall'utente non cambiano mai.
- Il giro di Claude, se arriva in ritardo, può sostituire quello di riserva, ma solo alle stesse condizioni. Il giro di riserva non sostituisce mai quello di Claude.
- Gli `id` sono deterministici: rifare il giro con gli stessi dati dà gli stessi `id`.

## 4. Fonti dati (tutte gratuite)

| Dato | Fonte | Note verificate il 19/10/2026 |
|---|---|---|
| Palinsesto | The Odds API, `/v4/sports/{chiave}/events` | Gratis, non consuma crediti. Copre tutte le competizioni: `soccer_uefa_champs_league`, `soccer_uefa_europa_league`, `soccer_epl`, `soccer_spain_la_liga`, `soccer_italy_serie_a`, `soccer_germany_bundesliga`, `soccer_france_ligue_one`, `soccer_netherlands_eredivisie`, `soccer_portugal_primeira_liga`, `soccer_efl_champ`, `soccer_italy_serie_b`, `soccer_spain_segunda_division`, `soccer_germany_bundesliga2`, `soccer_france_ligue_two`, nazionali (`soccer_uefa_nations_league`, qualificazioni) |
| Quote | The Odds API, `/v4/sports/{chiave}/odds`, regione `eu`, mercati `h2h,totals` | Costo = mercati × regioni per chiamata (2 crediti per competizione). Piano gratuito di circa 500 crediti al mese, da confermare con l'intestazione `x-requests-remaining`. Pinnacle (`pinnacle`) è nella regione `eu`; bet365 non c'è |
| Statistiche e storico | football-data.co.uk, `mmz4281/2627/{E0,E1,SP1,SP2,I1,I2,D1,D2,F1,F2,N1,P1}.csv` | Stagione 2026/27 disponibile: gol, gol primo tempo, xG, tiri, angoli, falli, cartellini, arbitro, quote bet365 e medie. Aggiornati circa due volte a settimana. Si usano anche le ultime due stagioni (`2526`, `2425`) |
| Esiti rapidi | football-data.org, piano gratuito | 12 competizioni, 10 richieste al minuto. Risultato finale e primo tempo |
| Esiti completi (angoli, cartellini) | football-data.co.uk | Arrivano con qualche giorno di ritardo; fino ad allora la giocata resta senza esito (conta come in corso, cioè persa per lo stop: è la regola prudente già in vigore) |
| Esiti di Europa League, seconde divisioni nei primi giorni, nazionali | The Odds API, `/v4/sports/{chiave}/scores?daysFrom=3` | 2 crediti per competizione, chiamato **solo** se ci sono giocate senza esito in una competizione che football-data.org non copre. Le giocate su queste competizioni sono rare (§5.5), quindi il costo è basso **[scelta di Claude]** |
| Notizie | Ricerca web di Claude | Infortuni, squalifiche, cambio allenatore, meteo estremo. Nella giornata si registrano la fonte e l'ora |

**Chiavi**: l'utente crea due account gratuiti, The Odds API e football-data.org, e incolla le chiavi nei *secrets* del repository (`ODDS_API_KEY`, `FOOTBALL_DATA_ORG_KEY`). **[utente: "va bene"]** Le istruzioni vanno nel README.

**Budget crediti [scelta di Claude]**: ogni giorno si spendono al massimo `crediti rimasti ÷ giorni rimanenti alla fine del mese`, lasciando una riserva del 20% per la Fase 3. Se il budget non basta, si seguono le priorità del §6.3 del documento (top 5 e coppe, poi Eredivisie, Primeira e Championship, poi seconde divisioni). Le competizioni rimaste fuori vanno in `competizioniNonCoperte`. Le quote si scaricano solo per le competizioni che hanno partite nella giornata (palinsesto gratuito).

**Nomi delle squadre**: The Odds API, football-data.co.uk e football-data.org scrivono i nomi in modo diverso. Serve una tabella di corrispondenza versionata (`src/dati/squadre.js`) con un confronto tollerante come ripiego. Una partita senza corrispondenza viene saltata, e il motivo va in `erroriGiro` e nella tabella da completare.

**Termini d'uso**: si rispettano i limiti di ogni API. I CSV di football-data.co.uk si scaricano una volta al giorno al massimo, con un `User-Agent` che identifica il progetto. Nessuno scraping di siti che lo vietano. Niente pacchetti npm: `fetch` e un parser CSV minimo bastano.

## 5. Modelli

### 5.1 Gol (1X2, doppia chance, under/over, gol/no gol, risultato esatto, handicap asiatico, primo tempo)
- **Modello di Poisson con correzione Dixon-Coles** per i risultati bassi. Per ogni campionato si stimano attacco e difesa di ogni squadra e il vantaggio del campo.
- I dati sono le partite delle ultime 2 stagioni più quella in corso, con un peso che decresce col tempo (mezza vita di circa 6 mesi **[scelta di Claude]**).
- Come misura dei gol si usa una media tra **gol reali e xG** (per esempio 50/50), più stabile dei soli gol. Quando manca l'xG si usano i soli gol.
- Le squadre neopromosse partono dai valori medi della categoria da cui vengono, ridotti di poco, e si aggiornano con le partite giocate.
- Il **primo tempo** usa la quota storica dei gol segnati nel primo tempo, per campionato.
- Dalla matrice dei risultati si ricavano tutti i mercati dei gol.

### 5.2 Confronto con il mercato
- Quando c'è la quota Pinnacle per lo stesso mercato, si toglie il margine (metodo proporzionale) e si ottiene la probabilità del mercato.
- **Probabilità finale = media tra modello e Pinnacle (50/50)**. Se la differenza supera 10 punti percentuali, il candidato viene scartato con il motivo "stima troppo lontana dal mercato". **[scelta di Claude]**
- Senza Pinnacle la probabilità è quella del modello, e la scheda lo dice.

### 5.3 Quota usata per il value
- bet365 non è nelle API gratuite. La "quota trovata" è la **mediana delle quote dei bookmaker della regione `eu`**, esclusi gli exchange. La fonte nella scheda è "mediana di N bookmaker (The Odds API)" con l'ora. **[scelta di Claude]**
- Si usa la mediana, non la quota migliore, perché bet365 di solito paga vicino alla media del mercato, quasi mai la quota più alta. La quota minima resta la protezione: l'utente gioca solo se bet365 paga almeno quella.
- Primo tempo, risultato esatto, handicap asiatico e gol/no gol non hanno quote gratuite nel piano scelto e diventano "quota da verificare" (§5.4).

### 5.4 Angoli, cartellini e altri mercati senza quote gratuite
- **Angoli**: tassi di angoli fatti e subiti per squadra, in casa e in trasferta, con peso decrescente nel tempo. Il totale segue un Poisson (oppure una binomiale negativa se i dati mostrano più variabilità).
- **Cartellini**: tassi per squadra più la media dell'arbitro, se noto e con almeno 5 partite. Altrimenti media del campionato.
- Il codice attuale fa passare ogni candidato con `quota: null` (il value risulta esattamente la soglia). Perciò il filtro sta **prima** di `selezionaGiocate`. **[scelta di Claude]**
  - Si tiene un candidato senza quota solo se la probabilità del modello si scosta di almeno **10 punti** dalla frequenza media del campionato per quella linea (per esempio over 9,5 angoli). Il bookmaker prezza vicino alla media; si propone solo quando la partita è chiaramente diversa.
  - La quota giusta deve stare nel range delle singole (1,60–3,00).
  - Al massimo **2 candidati senza quota al giorno**, quelli con lo scostamento maggiore.
- Restano segnati "quota da verificare su bet365" e nello storico sono già separati (`quotaDaVerificare`).
- Angoli e cartellini si propongono solo nei campionati con i CSV di football-data.co.uk: lì ci sono i dati per stimarli e per sapere l'esito. Niente angoli o cartellini su coppe e nazionali.
- Esiti: le multiple si chiudono dalle gambe (vinta se tutte vinte, persa se una persa). L'handicap asiatico si limita a linee intere e mezze, perché il modello dati non ha "mezza vinta".

### 5.5 Coppe europee e nazionali
- Le squadre di campionati diversi non sono confrontabili con il modello per campionato. Se un indice di forza gratuito tra campionati (per esempio ClubElo, che il 19/10 non rispondeva) funziona in modo stabile, lo si usa per correggere attacco e difesa.
- Altrimenti, per coppe e nazionali la probabilità è solo quella di Pinnacle. Così un value nasce solo se la mediana dei bookmaker supera la quota giusta di Pinnacle di almeno il 5%: succede raramente, ed è corretto così. Il ragionamento lo dichiara. **[scelta di Claude]**

### 5.6 Ragionamento
Ogni candidato porta 3-4 righe in italiano generate dai numeri. Per esempio:
- "Gol attesi: Inter 1,9 – Lecce 0,8 (forma su xG e gol, ultime 2 stagioni)"
- "Modello 62%, Pinnacle 58%, probabilità usata 60%"
- "Quota mediana 1,85 su 9 bookmaker alle 07:36"

Claude aggiunge una riga sulle notizie: "Notizie controllate alle 08:15: nessuna assenza rilevante (fonte)".

### 5.7 Quali candidati entrano nel file
Per ogni partita si calcolano tutti i mercati, e il file interno di raccolta li conserva tutti, così una correzione può far salire un mercato rimasto sotto soglia. Nel file della giornata, **dopo** le correzioni, vanno al massimo i 5 mercati con value più alto purché positivo, più i candidati senza quota che superano il §5.4. Così `scartate` resta leggibile. **[scelta di Claude]**

## 6. Routine Claude

- **Verifica dei limiti** (documentazione ufficiale letta il 19/10/2026): le routine sono disponibili sul piano Pro. La documentazione indica limiti orari, cioè 100 esecuzioni pianificate all'ora per account e 30 "Run now" all'ora per routine. Ogni esecuzione consuma l'uso dell'abbonamento come una chat. Alcuni blog citano "5 esecuzioni al giorno su Pro": una sola esecuzione al giorno rientra comunque.
- **Orario 08:07**: la documentazione avverte che le routine programmate allo scoccare dell'ora possono partire con qualche minuto di ritardo.
- **Prompt della routine**: breve, rimanda a `docs/routine/giro-del-mattino.md` nel repository. Così le istruzioni sono versionate e si cambiano con un commit.
- **Ambiente**: Default, con rete "Trusted": GitHub e nodejs.org sono già consentiti e non servono altri domini né chiavi. Connettori: nessuno.
- **Node**: l'immagine cloud ha Node 20-22 (22 di default), mentre il repository chiede Node 24. Lo script di setup dell'ambiente scarica Node 24 da nodejs.org, e il risultato resta in cache. In alternativa, se tutti i test passano su Node 22, si abbassa `engines` a `>=22`. Si verifica nel primo giro di prova. **[scelta di Claude]**
- **Push**: secondo la documentazione la routine spinge su `claude/…` a meno che il prompt non indichi un altro ramo. Il prompt indica `main`. Se il push fallisce perché nel frattempo il repository è cambiato (per esempio una segnatura dal telefono), si fa `git pull --rebase` e si riprova.
- **Piano B se il push su `main` non è permesso** (da verificare nel primo giro di prova): la routine spinge solo `…-notizie.json` su un ramo `claude/notizie-<data>`. Una GitHub Action su quel push esegue `npm run giro` su `main` con le correzioni e le esclusioni. Il giro di riserva resta invariato.
- **Compito di Claude**, in ordine:
  1. `git pull`; se `data/raccolta/<oggi>.json` manca o è di un altro giorno, scrive un errore in `erroriGiro` e lancia comunque `npm run giro`, che produce una giornata vuota con l'errore.
  2. `npm run giro -- --anteprima`: elenca le partite che entrerebbero in gioco più le 5 successive per value. Solo su queste fa la ricerca web, per restare nei consumi.
  3. Per ogni partita cerca infortuni e squalifiche dei titolari chiave, un cambio d'allenatore recente, meteo estremo e motivazioni anomale (per esempio una squadra già salva o retrocessa). Scrive una correzione o un'esclusione **solo** se trova un fatto concreto, con fonte e ora.
  4. Applica le regole del §6.1: correzioni di probabilità per singolo mercato, oppure esclusioni di una partita intera o di un singolo candidato.
  5. `npm run giro`: applica correzioni ed esclusioni prima di `selezionaGiocate` (le esclusioni con motivo "notizia: …"), ricalcola le probabilità finali, calcola `statoBankroll` e scrive il file.
  6. `npm test`, commit "Giro del mattino AAAA-MM-GG", push.

### 6.1 Correzioni dalle notizie [utente: le notizie possono cambiare le probabilità; dettagli: scelta di Claude, delegata]
- **Su cosa si applica**: sulla probabilità **del modello**, prima della media con Pinnacle. Pinnacle alle 07:35 ha spesso già incorporato le notizie note: correggere la media intera conterebbe la notizia due volte. Con Pinnacle presente l'effetto sulla probabilità finale è quindi la metà della correzione; senza Pinnacle è intero.
- **Tetto**: al massimo **±8 punti percentuali** sulla probabilità del modello per ogni mercato, e la probabilità corretta deve restare tra 0,02 e 0,98.
- **Coerenza**: una correzione su una selezione vale anche per le altre selezioni dello stesso mercato. Per esempio over 2,5 −5 punti implica under 2,5 +5 punti: lo applica lo script, non Claude. Nell'1X2 Claude indica le correzioni di due esiti e il terzo si ricava, così il totale resta 100%.
- **Controllo col mercato**: lo scarto oltre 10 punti da Pinnacle (§5.2) si calcola **dopo** la correzione. Una correzione esagerata fa scartare la giocata invece di gonfiarne il value.
- **Cosa non si può fare**: inventare mercati o partite che il modello non ha calcolato. Correggere senza un fatto concreto, cioè senza fonte e ora. Si può invece far entrare un mercato che era sotto soglia.
- **Scheda**: una riga di ragionamento del tipo "Notizie: assente Lautaro (fonte, 08:15) → over 2,5: modello da 58% a 53%, finale 55%".
- **Storico**: le giocate con `correzioneNotizie` si potranno confrontare con le altre. Se dopo circa un mese le correzioni peggiorano i risultati, la regola si rivede.
- **Giro di riserva**: nessuna correzione, perché le notizie non sono controllate.

## 7. File e formati

- `data/raccolta/AAAA-MM-GG.json`: quote grezze con fonte e ora, probabilità del modello e di Pinnacle, candidati preliminari, crediti usati e rimasti, errori. È un file interno: non entra nella pagina.
- `data/raccolta/AAAA-MM-GG-notizie.json`: `{ controllateAlle, partiteControllate: [idPartita], esclusioni: [{ idPartita, idCandidato?, motivo, fonte }], correzioni: [{ idPartita, mercato, selezione, delta, motivo, fonte }] }`. `delta` è in punti di probabilità (per esempio `-0.05`). Correzioni che violano il §6.1 fanno fallire `npm run giro` con un messaggio chiaro, e Claude le deve sistemare.
- I candidati nella giornata hanno tre campi opzionali in più, che la build ignora: `probModello`, `probPinnacle` (o null) e `correzioneNotizie` (`{ delta, motivo, fonte }` o null). Servono allo storico per confrontare le giocate corrette e quelle non corrette.
- `data/giornate/AAAA-MM-GG.json`: **formato esistente**, senza `"esempio": true`. Si aggiungono solo campi opzionali che la build ignora: `"giro": "claude" | "riserva"` e `"notizieControllate": boolean`.
- `id` del candidato: stabile e leggibile, per esempio `calcio-<data>-<casa>-<trasferta>-<mercato>-<selezione>` normalizzato. Le segnature dipendono dall'`id`, quindi non deve cambiare se il giro viene rifatto.
- `sport` vale sempre `"calcio"`. `competizione` è il nome italiano (per esempio "Serie A", "Premier League").
- La giornata d'esempio `2026-10-19.json` viene tolta al primo giro reale, insieme alla segnatura di prova `esempio-nba-1` (6 €, fatta durante il test del pulsante). Così il bankroll riparte da 200 €.

## 8. Errori

- Ogni fonte che non risponde finisce in `erroriGiro` con il nome della fonte e l'ora, e la pagina lo mostra. Se una fonte non risponde, si riprova 2 volte con attesa. Le competizioni rimaste scoperte vanno in `competizioniNonCoperte`.
- Se mancano le quote di una competizione: niente candidati con quota per quella competizione, solo quelli del §5.4.
- Se la raccolta fallisce del tutto, il giro scrive una giornata con `giocate: []`, `scartate: []` e l'errore: la pagina dice perché non ci sono giocate.

## 9. Lasciato al builder
- Stima numerica di Dixon-Coles: un metodo iterativo semplice, senza librerie. Il valore di rho può essere fisso o stimato.
- Soglie esatte di peso temporale e quota di xG, purché fisse e scritte in `src/config.js`, separate dalle costanti della Fase 1.
- Struttura dei moduli (per esempio `src/dati/`, `src/modelli/calcio/`, `src/giro/`) e script npm.
- Tabella dei nomi delle squadre.

## 10. Rischi noti
- **Crediti delle quote**: circa 500 al mese sono pochi. La Fase 3, con le quote prima delle partite, avrà bisogno di una seconda fonte gratuita o di un uso molto mirato.
- **football-data.co.uk** aggiorna due volte a settimana: le ultime partite entrano nel modello con un ritardo di qualche giorno. Gli esiti di angoli e cartellini arrivano tardi.
- **La mediana non è la quota bet365**: la quota minima protegge l'utente, ma lo storico "proposte" misura il metodo sulla mediana.
