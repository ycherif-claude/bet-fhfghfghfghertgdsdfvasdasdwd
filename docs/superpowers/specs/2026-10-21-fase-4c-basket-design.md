# Fase 4c – Basket europeo e australiano: Eurolega e NBL

*Data: 21 ottobre 2026 · Stato: approvato dall'utente il 21 ottobre 2026*

Estende le Fasi 2, 4a (NBA) e 4b (tennis). Valgono le loro regole salvo dove questo documento dice altro: probabilità, correzioni dalle notizie (±8 punti), scrittura protetta della giornata, riserva, esiti, `selezionaGiocate` unica per tutti gli sport, giro della sera prima.

Legenda: **[utente]** = deciso dall'utente; **[scelta di Claude]** = deciso da Claude, modificabile.

## 1. Scopo

La giornata del sito comprende anche Eurolega e NBL australiana, con giocate di value su vincente, handicap e totale punti. L'unica fonte di quote gratuite per il basket fuori dall'NBA è The Odds API, che copre solo questi due campionati. Gli altri campionati del documento di progetto (§4: ACB, Serie A, BSL, Lega greca, BBL, LNB, ABA, Eurocup) restano fuori finché non c'è una fonte di quote gratuita. **[utente: "solo Eurolega e NBL"]**

## 2. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- Campionati: **Eurolega** (chiave `basketball_euroleague`) e **NBL** (chiave `basketball_nbl`). `sport` vale `"basket"`, il valore della pagina per il basket non NBA. `competizione` vale "Eurolega" oppure "NBL (Australia)".
- Mercati: **vincente, handicap e totale punti**, supplementari compresi, con gli stessi nomi e le stesse regole dell'NBA (Fase 4a §5.4): `Vincente`, `Handicap <linea>`, `Totale punti <linea>`.
- Modello: lo stesso dell'NBA (`src/nba/modello.js`), cioè forze in punti, fattore campo, back-to-back, peso che scende a inizio stagione e prior della stagione precedente che svanisce, stimato separatamente per ogni campionato. **[scelta di Claude]**
- Confronto con il mercato: con media 50/50 (0,75/0,25 a inizio stagione) e scarto massimo di 10 punti.
- **Linee e riferimento [scelta di Claude]:** per handicap e totale si usa la linea offerta dal maggior numero di bookmaker (come `lineaComune` dell'NBA), e la mediana si calcola solo su quella linea. Come riferimento si usa Pinnacle senza margine se offre **la stessa linea**; altrimenti la media senza margine dei bookmaker su quella linea (almeno 3). Un mercato senza riferimento si scarta, come per l'NBA. Non si "traducono" le probabilità tra linee diverse.
- **Solo Pinnacle o consenso**, cioè senza modello (Eurolega API giù, NBL con meno di 8 partite): ammesso su tutti e tre i mercati. In quel caso il value nasce solo se la mediana batte la quota giusta di almeno il 5%, cosa rara.

**Non-obiettivi**
- Campionati senza quote gratuite.
- Mercati per quarto o per tempo, e totali di squadra.
- Un giro serale per il basket: l'Eurolega si gioca la sera in Europa, mentre l'NBL entra nel giro della sera prima (§3).

**Anti-obiettivi**
- Giocate su un modello senza dati sufficienti (NBL a inizio raccolta).
- Togliere crediti al calcio o al tennis.
- Errori silenziosi.

## 3. Architettura

- **Raccolta del mattino:** `data/raccolta/<data>-basket.json` (nuovo sport in `SPORT_RACCOLTA`), dentro `raccolta.yml` dopo il tennis e con `continue-on-error`. Le quote vengono da The Odds API con mercati `h2h,spreads,totals` e regione `eu`, quindi 3 crediti per campionato, chiesti solo nei giorni con partite nella finestra della giornata.
- **Crediti [scelta di Claude]:** stesso budget giornaliero unico del tennis (Fase 4b §3.2). L'ordine è calcio, poi tennis, poi basket.
  - La spesa del giorno si legge sommando `crediti.usati` dei file di raccolta di calcio e tennis già scritti; i crediti rimasti si leggono dall'ultimo file scritto oppure dall'intestazione della prima chiamata gratuita.
  - Il basket tiene da parte **3 crediti** per la sera se l'NBL ha partite nelle 24 ore successive.
  - La sera, la spesa massima è 1 credito per torneo di tennis più 3 per l'NBL, mai sotto la riserva.
  - Se non basta, i campionati scoperti vanno in `competizioniNonCoperte` con "crediti insufficienti".
- **NBL e orari:** le partite NBL iniziano di solito tra le 08:00 e le 11:00 italiane.
  - Quelle che iniziano dopo il giro del mattino entrano normalmente.
  - Quelle che iniziano prima, fra le 00:00 e le 09:00, entrano nel **giro della sera prima**, nella stessa esecuzione serale di NBA e tennis. Si usa lo stesso meccanismo di aggiunta del tennis (`aggiungiSerale…`), generalizzato agli sport "notturni". **[scelta di Claude]**
  - Il workflow serale avvia la routine anche quando ci sono partite NBL notturne.
  - **Confini precisi [scelta di Claude]:** la sera del giorno D-1 si aggiungono le partite NBL che iniziano **prima delle 08:00** del giorno D, che appartengono alla giornata D-1. Le partite dalle 08:00 in poi sono della giornata D e le prende il giro del mattino di D: le NBL delle 09:30 italiane in inverno iniziano dopo il giro delle 08:07. Una partita fra le 08:00 e l'ora del giro del mattino resta scoperta, e la pagina lo segnala come "partita già iniziata". È un caso raro.
  - **File e passi separati:** la raccolta serale del basket scrive `data/raccolta/<data>-serale-basket.json` e le notizie `<data>-serale-basket-notizie.json`, con un passo suo nel workflow e lo stesso controllo "una volta al giorno" del tennis. Il formato del tennis non cambia. Il conteggio delle partite notturne passato a `--quando` è la somma di tennis e basket.

## 4. Fonti

| Dato | Fonte | Note (verificate il 20/10/2026) |
|---|---|---|
| Storico Eurolega (stagione 2026-27 = `E2026`) | API pubblica della Eurolega: `https://api-live.euroleague.net/v1/results?seasonCode=E<anno>&gameNumber=<giornata>` (XML) | Risponde senza chiave e dà tutte le giornate delle stagioni passate. Non è documentata come servizio per terzi: poche richieste al giorno, con attesa tra le richieste e `User-Agent` del progetto. Se non risponde o il formato non si legge, solo Pinnacle, con errore. |
| Storico NBL | TheSportsDB, piano gratuito senza chiave: `eventspastleague.php?id=4434` | Dà solo le **ultime 15 partite**. Il sistema le **salva ogni giorno** in `data/storico/nbl.json` (aggiunta senza doppioni, per `idEvent`) e costruisce lo storico nel tempo. Finché una delle due squadre ha meno di **8** partite salvate, la partita usa solo Pinnacle. **[scelta di Claude]** |
| Palinsesto e quote | The Odds API, `/events` (gratuito) e `/odds` con `h2h,spreads,totals` | Pinnacle è nella regione `eu`. |
| Esiti | Eurolega: API ufficiale; NBL: TheSportsDB (ultime partite) | Punteggio finale, supplementari compresi. |
| Notizie | Ricerca web di Claude | Infortuni e assenze, report delle squadre. |

**Nomi delle squadre:** una tabella fissa per campionato, con il nome di The Odds API e gli alias delle altre fonti: 18-20 squadre in Eurolega, 10 in NBL. Una squadra non riconosciuta va in `erroriGiro` e la sua partita non ha candidati.

## 5. Modello

- Si riusa il modello NBA con costanti proprie in `CONFIG.basket` (mezza vita, deviazioni iniziali di margine e totale, fattore campo di partenza).
  - In Eurolega e in NBL i punteggi sono più bassi dell'NBA (circa 80-90 punti a squadra): le deviazioni iniziali si stimano dai dati e, finché i dati sono pochi, valgono **margine 11, totale 15**. **[scelta di Claude]**
  - Il back-to-back è raro. Per l'Eurolega conta invece il **doppio turno settimanale** (due partite in 3 giorni): −1 punto di margine alla squadra alla seconda partita in 3 giorni. **[scelta di Claude]**
- Peso del modello: 0,5, che scende a 0,25 se una delle due squadre ha meno di 8 partite nella stagione in corso (in Eurolega una stagione ha 38 giornate).

## 6. Notizie e routine
- Giro del mattino: nuova sezione basket. Assenza confermata di un titolare → correzione o esclusione; "in dubbio" → nessuna correzione, solo nel messaggio finale. Valgono le stesse regole e la stessa tabella dei mercati correggibili dell'NBA.
- Giro della sera prima: parte basket per le partite NBL notturne, come per il tennis.

## 7. Rischi
- **Crediti delle quote:** con calcio, tennis e basket il budget mensile di circa 500 crediti è stretto. Il basket è l'ultimo nella priorità e resterà scoperto nei giorni pieni. Lo si rivaluta dopo una settimana di consumo reale. Se serve, si chiedono solo `spreads,totals` (2 crediti) e il vincente si ricava dal modello e dalle quote della linea.
- **API della Eurolega** non garantita: c'è il ripiego solo Pinnacle.
- **NBL** con modello spento per le prime settimane: è previsto.

## 8. Lasciato al builder
- Come generalizzare il giro della sera prima (oggi solo tennis) per l'NBL, senza cambiare il tennis.
- Struttura dei moduli (`src/basket/`), riusando `src/nba/modello.js` e `src/nba/quote.js` dove è possibile.
- Parser XML minimo per l'API della Eurolega.

## 9. Modifiche durante la costruzione (21 ottobre 2026) [scelta di Claude]

- **TheSportsDB:** la chiave gratuita `3` indicata al §4 è stata disattivata. Con la nuova chiave pubblica `123`, `eventspastleague` dà solo l'ultima partita, mentre `eventsround.php?id=4434&r=<giornata>&s=<stagione>` dà tutte le partite di una giornata, anche delle stagioni passate. Lo storico NBL si scarica quindi per giornata, come quello dell'Eurolega: la stagione precedente una volta sola (22 giornate di stagione regolare), quella in corso ogni mattina dall'ultima giornata salvata. Il modello NBL parte subito, senza aspettare settimane.
- **Partite salvate minime (8):** si contano su tutte le stagioni salvate, non solo su quella in corso. Con la stagione precedente scaricata, il "solo mercato" resta per le squadre nuove.
- **Giro della sera prima:** non serve. La raccolta del mattino copre già la giornata intera fino alle 08:00 del giorno dopo (come per il tennis), quindi le partite NBL notturne entrano nella giornata del giorno prima con le quote del mattino. Niente raccolta serale del basket, niente riserva di 3 crediti per la sera e nessun cambio al workflow serale. Se servirà ricontrollare quote e notizie la sera, sarà una fase a parte.
- **Mezza vita:** 60 giorni (circa due partite a settimana), invece dei 30 dell'NBA.
