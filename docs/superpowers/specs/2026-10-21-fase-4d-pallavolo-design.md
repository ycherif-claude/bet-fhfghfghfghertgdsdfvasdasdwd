# Fase 4d – Pallavolo

*Data: 21 ottobre 2026 · Stato: bozza da approvare*

Estende le Fasi 2, 4a, 4b e 4c. Valgono le loro regole salvo dove questo documento dice altro: probabilità, correzioni dalle notizie (±8 punti), scrittura protetta della giornata, riserva, esiti, `selezionaGiocate` unica per tutti gli sport.

Legenda: **[utente]** = deciso dall'utente; **[scelta di Claude]** = deciso da Claude, modificabile.

## 1. Scopo

La giornata del sito comprende la pallavolo, maschile e femminile, con giocate di value. Le uniche quote gratuite trovate sono quelle di **OddsPapi** (piano gratuito: 250 richieste al mese, una richiesta per partita, con Pinnacle e bet365). Per questo si coprono poche partite al giorno, scelte per priorità del campionato. **[utente: "va bene"]** Le richieste al giorno sono circa 6, dopo la riserva del 20%. Ogni campionato con partite costa anche 1 richiesta per l'elenco delle partite, quindi in pratica si coprono **circa 4-5 partite al giorno**.

L'utente non apre più account per aggirare i limiti: è vietato dai termini d'uso e metterebbe a rischio gli account esistenti. **[deciso insieme]**

## 2. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- Campionati, in ordine di priorità (documento di progetto §4) **[scelta di Claude]**:
  1. SuperLega
  2. CEV Champions League maschile e femminile
  3. Serie A1 femminile
  4. PlusLiga
  5. Liga turca
  6. Bundesliga

  D'estate si aggiungono VNL e Mondiali, se OddsPapi li copre.
- `sport` = `"pallavolo"`. `competizione` = nome italiano ("SuperLega", "Serie A1 femminile", "Champions League maschile"…).
- Mercati, tutti ricavati dalla probabilità di vincere un set **[scelta di Claude]**:
  - `Vincente` (nome della squadra);
  - `Handicap set -1.5` / `+1.5` (riferito alla squadra di casa, selezione `casa`/`trasferta`): la squadra a −1,5 deve vincere 3-0 o 3-1;
  - `Totale set 3.5` (`Over 3.5` = la partita va al quarto o al quinto set; `Under 3.5` = finisce 3-0).

  Le quote vere servono per tutti e tre. Un mercato senza quota gratuita non si propone.
- **Quote bet365:** OddsPapi le dà. Si mostrano sulla scheda accanto alla mediana, come "quota bet365 alle HH:MM", tramite due campi opzionali nuovi del candidato e della giocata, `quotaBet365` e `oraQuotaBet365`, che gli altri sport non usano. La pagina li mostra quando ci sono: è una piccola modifica alla pagina. Il value si calcola sulla **mediana** dei bookmaker, come per gli altri sport, così la regola resta uguale.

**Non-obiettivi**
- Totale punti, risultato esatto in set, mercati per set: si valuteranno dopo.
- Più di circa 8 partite al giorno.

**Anti-obiettivi**
- Sprecare le richieste gratuite, per esempio interrogando partite già senza value certo o ripetendo chiamate.
- Giocate su un modello senza dati.
- Errori silenziosi.

## 3. Architettura

- **Raccolta del mattino:** `data/raccolta/<data>-pallavolo.json` (nuovo sport in `SPORT_RACCOLTA`), dentro `raccolta.yml` dopo il basket e con `continue-on-error`. La chiave è `ODDSPAPI_API_KEY` nei secrets.
- **Palinsesto [scelta di Claude]:** è l'elenco delle partite di OddsPapi (`/fixtures`, 1 richiesta per campionato), così le partite hanno già l'identificativo per le quote e non serve abbinare due palinsesti. Si chiede solo per i campionati che, secondo TheSportsDB (gratuito), hanno partite nella giornata.
- **Nomi delle squadre:** si abbinano i nomi di OddsPapi con quelli dello storico TheSportsDB tramite una tabella di alias per campionato. Una squadra non riconosciuta va in `erroriGiro`; la partita resta senza modello (solo Pinnacle) e la richiesta delle quote si fa solo se c'è budget.
- **Richieste OddsPapi [scelta di Claude]:**
  - budget giornaliero = `floor((rimaste − 20% di 250) / giorni rimanenti nel mese)`, con le rimaste lette dall'ultima risposta (o tenute in un piccolo file di stato `data/stato/oddspapi.json` se l'API non le dice);
  - si chiede l'elenco delle partite con quote (`/fixtures`) per campionato, solo per i campionati con partite nella giornata e in ordine di priorità, poi le quote (`/odds`) di una partita alla volta;
  - **tutte** le richieste contano nel budget, sia gli elenchi sia le quote;
  - ci si ferma quando il budget del giorno finisce, e le partite rimaste vanno in `competizioniNonCoperte` come "<campionato>: richieste OddsPapi finite";
  - tra due chiamate allo stesso endpoint passa almeno 1 secondo.
- **Orari:** le partite si giocano di solito tra le 17:00 e le 21:00 italiane, quindi basta il giro del mattino. Niente giro serale per la pallavolo.
- **Storico:** TheSportsDB gratuito dà solo le ultime 15 partite per campionato. Il sistema le **salva ogni giorno** in `data/storico/pallavolo-<campionato>.json`, senza doppioni, e costruisce lo storico nel tempo, come per l'NBL.

## 4. Modello

- **Elo per squadra, per campionato**, ricalcolato ogni giorno dalle partite salvate (niente punteggi memorizzati a parte), con il margine in set (3-0 pesa più di 3-2, dai set vinti indicati da TheSportsDB). Si parte da 1500, con un K unico e un vantaggio campo fisso di 30 punti Elo. Una nuova stagione riporta tutti per un terzo verso 1500. **[scelta di Claude]**
- **Dalla probabilità di vincere la partita a quella del singolo set** (al meglio dei 5): con s = probabilità di vincere un set, P(vittoria) = s³·(1 + 3(1−s) + 6(1−s)²). Si ricava s per bisezione, poi i mercati:
  - P(3-0) = s³;
  - P(3-1) = 3s³(1−s);
  - P(3-2) = 6s³(1−s)²;
  - lo stesso per l'altra squadra con 1−s;
  - Handicap −1,5 = P(3-0) + P(3-1);
  - Totale set 3,5 Over = 1 − P(3-0) − P(0-3).
- **Senza modello** finché una delle due squadre ha meno di **8** partite salvate: in quel caso solo Pinnacle senza margine, su tutti i mercati. Il value nasce solo se la mediana batte la quota giusta di almeno il 5%. Nelle prime settimane sarà quasi sempre così: è previsto.
- **Con il modello:** media 50/50 con Pinnacle (0,75/0,25 se una squadra ha meno di 15 partite), scarto massimo di 10 punti.

## 5. Notizie
- Giro del mattino: sezione pallavolo. Assenza confermata di un titolare chiave (opposto, schiacciatore principale, palleggiatore) → correzione o esclusione; turnover annunciato → correzione.
- Valgono le stesse regole dei mercati correggibili: `Vincente`, `Handicap set` e `Totale set` sono correggibili, e la complementare si ricava in automatico.

## 6. Esiti
- Da TheSportsDB: set vinti dalle due squadre. Vincente, handicap set e totale set si chiudono sul risultato in set.

## 7. Collaudo
- Con la chiave vera, prima di attivare la pallavolo si verifica:
  - quali campionati OddsPapi copre;
  - se per la pallavolo ci sono i mercati handicap set e totale set; quelli che mancano non si propongono;
  - come conta le richieste;
  - i termini d'uso.

## 8. Rischi
- **Copertura di OddsPapi per la pallavolo non verificata:** è dichiarata per PlusLiga, Champions League e VNL. Al collaudo con la chiave vera si controlla ogni campionato, e quelli non coperti restano fuori con un messaggio.
- **Poche richieste:** 8 partite al giorno sono poche nei giorni pieni. La priorità protegge i campionati principali.
- **Storico breve:** modello spento per le prime settimane.
- **Termini d'uso di OddsPapi:** da leggere al collaudo, per l'uso personale.

## 9. Lasciato al builder
- Struttura dei moduli (`src/pallavolo/`), riusando il più possibile (Elo con bisezione dal tennis, quote mediana e consenso dall'NBA).
- Nomi delle squadre: tabella per campionato, con gli alias delle fonti.
- Formato esatto delle risposte di OddsPapi e TheSportsDB, preso dalla loro documentazione.
