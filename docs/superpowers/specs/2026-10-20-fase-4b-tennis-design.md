# Fase 4b – Tennis: dati, modello, giro del mattino e giro della sera prima

*Data: 20 ottobre 2026 · Stato: bozza da approvare*

Estende le Fasi 2 e 4a. Valgono le loro regole salvo dove questo documento dice altro: probabilità, correzioni dalle notizie (±8 punti), scrittura protetta della giornata, riserva, esiti, `selezionaGiocate` unica per tutti gli sport.

Legenda: **[utente]** = deciso dall'utente; **[scelta di Claude]** = deciso da Claude, modificabile.

## 1. Scopo

Ogni giorno la giornata del sito comprende anche il tennis: le partite dei tornei principali, con giocate sul vincente dell'incontro quando c'è value. L'utente non ha mai scommesso sul tennis, quindi le schede spiegano il mercato in parole semplici.

## 2. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- Tornei (documento di progetto §4): Slam, ATP Masters 1000, ATP 500, WTA 1000, WTA 500, ATP Finals, Coppa Davis, Billie Jean King Cup. In pratica si prendono **tutte** le chiavi `tennis_atp_*` e `tennis_wta_*` che `/v4/sports` indica come attive, perché The Odds API copre solo i tornei principali. Se comparisse un torneo minore, lo si tiene lo stesso. **[scelta di Claude]**
- Mercato: **vincente dell'incontro** (mercato `Vincente incontro`, selezione = nome del giocatore). **[scelta di Claude, l'utente non ha preferenze]** - **Ritiri [scelta di Claude, da confrontare con il regolamento bet365 al collaudo]:**
  - ritiro **con almeno un set completato**: vince chi passa il turno;
  - ritiro prima della fine del primo set, oppure walkover (partita mai iniziata): giocata **rimborsata**.
  - tennis-data riporta il punteggio dei set e il commento "Retired" o "Walkover", da cui si capisce il caso.
- **Giro della sera prima [utente]:** la sera aggiunge alla giornata le partite che iniziano di notte o all'alba (tornei in Asia e Australia), prima del giro del mattino successivo.

**Non-obiettivi (per ora)**
- Game, set, handicap game, totale game, risultato esatto, tie-break: non ci sono quote gratuite affidabili. Si valuteranno quando lo storico del vincente lo giustifica. **[scelta di Claude]**
- Tornei minori (ATP 250, Challenger, ITF).
- Controlli prima di ogni partita: Fase 3.

**Anti-obiettivi**
- Consumare i crediti di The Odds API a scapito del calcio: il tennis usa solo i crediti che restano dopo il calcio, sopra la riserva.
- Collegare un giocatore alle statistiche di un altro con un nome simile, per esempio due fratelli o due giocatori con lo stesso cognome.
- Errori silenziosi.

## 3. Architettura

```
05:35 UTC  raccolta.yml: calcio, NBA e tennis → data/raccolta/AAAA-MM-GG-tennis.json, ed esiti tennis dei giorni prima
07:07 UTC  routine del mattino: notizie anche sul tennis (ritiri, infortuni) → giornata unica
11-23 UTC  serale (serale-nba.yml, da rinominare serale.yml): giro serale NBA come oggi + giro della sera prima tennis
```

### 3.1 Giro della sera prima, tennis
- **Orario:** lo stesso del giro serale NBA, cioè le 22:00, oppure prima se ci sono partite NBA prima delle 22:30. Si fa **una sola esecuzione** della routine serale, che fa entrambe le cose. Se non ci sono giocate NBA, la routine parte lo stesso alle 22:00 quando ci sono partite di tennis da aggiungere. **[scelta di Claude]**
- **Quali partite:** quelle dei tornei in corso che iniziano **dopo l'ora del giro serale e prima delle 08:00** del mattino dopo. Appartengono ancora alla giornata in corso, che va dalle 08:00 alle 08:00. Le partite già presenti fra i candidati della giornata non si ripetono.
- **Cosa fa la GitHub Action, prima di avviare la routine:**
  1. scarica le quote tennis fresche, cioè una chiamata per torneo attivo a The Odds API, solo `h2h`;
  2. scarica i risultati recenti necessari al modello;
  3. scrive `data/raccolta/AAAA-MM-GG-serale-tennis.json`, nello stesso formato della raccolta tennis, con solo quelle partite.

  Se le partite notturne sono zero, la parte tennis non serve.
- **Cosa fa Claude:** controlla le notizie su quelle partite (ritiri, infortuni, partite lunghe del giorno prima) e scrive le correzioni e le esclusioni nello stesso formato del giro del mattino, nel file `data/raccolta/AAAA-MM-GG-serale-tennis-notizie.json`. Poi lancia `npm run serale-tennis`.
- **Come si aggiungono le giocate [scelta di Claude]** (senza modificare `src/regole`):
  - si costruiscono i candidati delle sole partite notturne, con le stesse regole del giro;
  - le giocate già proposte nella giornata non cambiano mai;
  - le nuove giocate passano per `selezionaGiocate` con uno stato corretto: `inGiocoOggi` = quello di `statoBankroll` + le puntate proposte oggi non annullate e non ancora segnate; `distanzaStop` = quella di `statoBankroll` − la stessa somma;
  - dal risultato si tolgono le multiple e si tengono al massimo `10 − singole già proposte` singole, quelle con value più alto. Le altre vanno in `scartate` con il motivo "limite giornaliero singole";
  - si aggiungono in fondo a `giocate`, e i candidati e gli scarti si aggiungono a `candidati` e `scartate`;
  - si scrive solo se nessuna delle **nuove** partite è già iniziata. Le segnature sulle giocate esistenti non bloccano l'aggiunta, perché non le tocca.

- **Un solo avvio serale:** il workflow serale avvia la routine quando c'è **almeno una giocata NBA** da controllare **oppure almeno una partita di tennis notturna** con quote. L'avviso "controllo serale non eseguito" resta solo per le giocate NBA.
- Se la parte tennis fallisce (quote o storico), il motivo va in `erroriGiro` della giornata e la parte NBA va avanti, e viceversa.
- **File di Claude:** le decisioni NBA restano nel loro file (`-serale-nba.json`); le notizie tennis usano il formato del giro del mattino nel file `-serale-tennis-notizie.json`.

### 3.2 Crediti
- Il tennis consuma 1 credito per torneo e per chiamata (solo `h2h`, regione `eu`).
- **Budget giornaliero unico per calcio e tennis [scelta di Claude]:** `budgetCrediti` della Fase 2 si calcola una volta sola. Il calcio spende per primo, e il tennis può spendere solo quello che il calcio ha lasciato del budget del giorno. Una prima quota di mattina e una di sera sono comprese nello stesso budget: la raccolta del mattino tiene da parte 1 credito per ogni torneo attivo, per il giro della sera prima.
- Il giro della sera prima ha un budget suo: al massimo 1 credito per torneo e mai sotto la riserva.
- Se mancano i crediti, i tornei restano scoperti, finiscono in `competizioniNonCoperte` e la pagina lo dice.

## 4. Fonti

| Dato | Fonte | Note |
|---|---|---|
| Storico risultati | **tennis-data.co.uk**: un file ATP e uno WTA per stagione, `…/2026/2026.xlsx` e `…/2026w/2026.xlsx` (l'indirizzo esatto si legge da `alldata.php`) | Gratuito. Contiene torneo, superficie, turno, giocatori, set e quote di chiusura (anche Pinnacle e bet365). È in formato **xlsx**: serve un lettore xlsx minimo senza pacchetti npm (zip con `zlib.inflateRawSync` più XML del foglio e delle stringhe condivise). Si usano le stagioni corrente e precedente. Aggiornato più volte a settimana. **[verificato il 20/10/2026: i file 2026 esistono]** |
| Palinsesto e quote | The Odds API: `/v4/sports` (gratis) per i tornei attivi `tennis_atp_*` e `tennis_wta_*`, `/events` (gratis), `/odds` con `h2h` e regione `eu` (1 credito) | Pinnacle è incluso nella regione `eu` |
| Esiti | tennis-data.co.uk, più The Odds API `/scores` (2 crediti) solo per i tornei con giocate senza esito da più di un giorno e solo se il budget lo permette | Il ritiro a partita iniziata si legge dalla colonna dei commenti di tennis-data ("Retired") e dà una giocata rimborsata |
| Notizie | Ricerca web di Claude | Ritiri, infortuni, fatica |

**Nomi dei giocatori [scelta di Claude]:** tennis-data li scrive come "Sinner J.", The Odds API come "Jannik Sinner". L'abbinamento vale solo se coincidono il cognome normalizzato, anche composto, e l'iniziale del nome, e se nel torneo c'è un solo giocatore così. Una tabella di alias copre i casi difficili: all'inizio è vuota e si riempie al collaudo e quando compaiono errori. Un giocatore non abbinato va in `erroriGiro`, con il nome com'è scritto nelle due fonti, e la sua partita non ha candidati.

## 5. Modello

- **Elo per giocatore**, uno complessivo e uno per superficie (cemento, terra, erba; il "Carpet" conta come cemento). **[scelta di Claude]**
  - K = 250 / (partite + 5)^0,4, il metodo usato di solito per il tennis.
  - Probabilità = media 50/50 dell'Elo complessivo e di quello della superficie.
  - Partenza a 1500 per tutti. Il poco storico si gestisce con il peso del modello qui sotto, non con l'Elo di partenza.
- **Slam maschili al meglio dei 5 set** (chiavi ATP di Australian Open, Roland Garros, Wimbledon e US Open): dalla probabilità al meglio dei 3 si ricava quella del singolo set, poi si calcola quella al meglio dei 5.
- **Confronto con il mercato:** come nel calcio. Media con Pinnacle senza margine, 50/50, che diventa 0,75 Pinnacle e 0,25 modello se uno dei due giocatori ha meno di 20 partite negli ultimi 12 mesi. Scarto massimo di 10 punti.
- **Quota per il value:** mediana dei bookmaker della regione `eu`, minimo 3, come nel calcio.
- **Ragionamento sulla scheda**, per esempio:
  - "Elo: Sinner 2150 (cemento 2180) – Rune 1950 (cemento 1930)";
  - "Modello 78%, Pinnacle 74%, probabilità usata 76%";
  - la riga sulle notizie;
  - la spiegazione "Vincente incontro: vince se Sinner vince la partita; se un giocatore si ritira a partita iniziata la giocata è rimborsata".

## 6. Notizie e routine
- **Giro del mattino:** nuova sezione tennis nelle istruzioni. Ritiro annunciato → esclusione; infortunio o malessere noto, o partita molto lunga il giorno prima → correzione entro ±0,08. Il mercato `Vincente incontro` è correggibile, e l'altra selezione si ricava in automatico.
- **Giro serale:** le istruzioni della routine serale aggiungono la parte tennis del §3.1. Restano i limiti di ricerche web: al massimo 10 per il serale, 20 per il mattino.

## 7. Rischi
- **tennis-data aggiornato con ritardo:** l'Elo può non includere le ultime partite. Il peso del mercato attenua l'effetto.
- **Il lettore xlsx scritto a mano** può rompersi se il formato del file cambia. Un errore di lettura deve comparire in `erroriGiro`, e il tennis resta senza modello, solo Pinnacle.
- **Crediti:** nelle settimane con molti tornei il budget può non bastare. Vale la priorità del documento di progetto §6.3, con il tennis dopo il calcio dei campionati principali.

## 8. Lasciato al builder
- Struttura dei moduli (`src/tennis/`), riusando ciò che è già generico.
- Dettagli dell'Elo, purché siano costanti in `CONFIG.tennis` e testate.
- Come rinominare o estendere il workflow serale senza rompere l'NBA.
