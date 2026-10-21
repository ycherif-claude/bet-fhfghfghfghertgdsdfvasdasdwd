# Analisi giocate

Sito personale che mostra ogni giorno le giocate consigliate (singole, multiple, builder), tiene il bankroll e lo storico. Il bankroll iniziale è 200 €, con stop settimanale a −50 €.

Il repository e il sito sono **pubblici**: nessuna password, per scelta. Il sito non è indicizzato dai motori di ricerca (`noindex` e `robots.txt`), ma chi conosce l'indirizzo può vederlo. Per questo il nome del repository è poco prevedibile.

## Come funziona

- I dati stanno in `data/` (giornate in `data/giornate/`, segnature in `data/segnature/`).
- A ogni push su `main`, a mano e ogni ora (al minuto 15) una GitHub Action esegue i test, costruisce `site/dati.json` e pubblica la cartella `site/` su GitHub Pages. La ricostruzione oraria serve ad aggiornare "oggi" e i promemoria.
- Nella pagina del giorno, "Giocata" (o "Saltata") scrive un file in `data/segnature/` tramite l'API di GitHub; "Annulla segnatura" lo cancella. Il bankroll si aggiorna dopo la ripubblicazione (1-2 minuti).

## Token per segnare le giocate

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Resource owner: il tuo account. Imposta una scadenza e ricordati di rinnovarlo.
3. Repository access: **Only select repositories** e scegli solo questo repository.
4. Repository permissions: **Contents: Read and write**. Nessun altro permesso.
5. Copia il token (si vede una volta sola).
6. Apri il sito, sezione **Impostazioni**: scrivi il repository nel formato `utente/nome`, incolla il token e premi **Salva**. Restano solo nel browser di quel dispositivo (localStorage). Ripeti su ogni dispositivo.
7. Per togliere il token da un dispositivo usa **Cancella codice** in Impostazioni. Attenzione: il localStorage di `<utente>.github.io` è condiviso da tutti i siti GitHub Pages "di progetto" dello stesso utente, quindi le altre tue pagine su quell'indirizzo potrebbero leggere il token. Non pubblicare lì codice di terzi e, se ne hai, preferisci un token di breve durata.

## Comandi in locale

- `npm test` esegue i test.
- `npm run build` crea `site/dati.json` da `data/`.
- `npm run serve` avvia il sito su http://localhost:8080.

Serve solo Node 24, nessun pacchetto da installare.

## Primo avvio

1. Su GitHub crea un repository **pubblico** con nome poco prevedibile, per esempio `analisi-` seguito da 6 caratteri casuali.
2. Nel repository: Settings → Pages → Source: **GitHub Actions**.
3. Crea il token come descritto sopra.
4. Collega la cartella locale al repository (`git remote add origin <indirizzo>`), poi `git push -u origin main`.
5. Controlla in Actions che "Pubblica sito" termini in verde e apri l'indirizzo del sito: mostra "Analisi di oggi non disponibile" finché non gira il primo giro reale (vedi la sezione sul calcio qui sotto).
6. Dal telefono inserisci repository e token in Impostazioni. Dopo il primo giro reale, premi "Giocata" su una scheda: deve comparire un file in `data/segnature/` e, dopo la ripubblicazione, il bankroll si aggiorna. "Annulla segnatura" lo riporta al valore precedente.

## Calcio: chiavi e giro del mattino

Le giocate di calcio si costruiscono ogni mattina da dati gratuiti. Servono due chiavi gratuite.

### Chiavi gratuite

1. **The Odds API** (quote): vai su the-odds-api.com, scegli il piano gratuito "Starter" e inserisci la tua email. La chiave arriva per email.
2. **football-data.org** (calendario e risultati): registrati gratis su football-data.org. La chiave arriva per email.

### Dove incollarle

Nel repository su GitHub: Settings → Secrets and variables → Actions → New repository secret. Crea due segreti:

- `ODDS_API_KEY`: la chiave di The Odds API;
- `FOOTBALL_DATA_ORG_KEY`: la chiave di football-data.org.

Non incollare mai le chiavi in una chat né in un file del progetto: vanno solo nei segreti di GitHub.

### Gli orari del mattino

- **Raccolta**: ogni giorno alle 05:35 UTC (07:35 ora legale, 06:35 ora solare). Scarica quote e statistiche e calcola le probabilità.
- **Giro di Claude**: alle 07:07 UTC, cioè 08:07 con l'ora solare e 09:07 con l'ora legale (le routine usano un orario UTC fisso, e prima delle 08:00 di Roma la giornata non è ancora iniziata). Claude controlla le notizie sulle partite (infortuni, squalifiche, allenatori, meteo) e fa girare il calcolo finale, secondo `docs/routine/giro-del-mattino.md`.
- **Giro di riserva**: alle 09:45 UTC (11:45 ora legale, 10:45 ora solare). Produce le giocate solo se il giro di Claude non c'è stato, e non sostituisce mai quello di Claude.

### Cosa significano le scritte sulle schede

- **Notizie non controllate**: la giocata viene dal giro di riserva, calcolata solo dai numeri. Nessuno ha controllato infortuni, squalifiche o altre notizie: prima di giocare dai un'occhiata tu.
- **Notizie non controllate per questa partita**: il giro di Claude c'è stato, ma per quella partita non ha controllato le notizie (non è tra quelle esaminate). Vale lo stesso consiglio: verifica tu infortuni e squalifiche.
- **Quota da verificare su bet365**: per quel mercato non c'è una quota gratuita. La giocata nasce dalla probabilità del modello: guarda la quota reale su bet365 prima di segnarla.

## NBA: chiavi e giro serale

Le giocate NBA (Vincente, Handicap e Totale punti, supplementari compresi) si costruiscono ogni mattina insieme a quelle di calcio, con dati gratuiti. Servono due chiavi gratuite.

### Chiavi gratuite

1. **balldontlie** (partite, risultati e statistiche): registrati gratis su balldontlie.io. La chiave si copia dal tuo profilo.
2. **SportsGameOdds** (quote): piano gratuito "Amateur" su sportsgameodds.com. La chiave si copia dal tuo profilo.

### Dove incollarle

Nel repository su GitHub: Settings → Secrets and variables → Actions → New repository secret. Crea due segreti:

- `BALLDONTLIE_API_KEY`: la chiave di balldontlie;
- `SPORTSGAMEODDS_API_KEY`: la chiave di SportsGameOdds.

Come per il calcio, non incollare mai le chiavi in una chat né in un file del progetto: vanno solo nei segreti di GitHub.

### La routine serale (`ROUTINE_SERALE_URL` e `ROUTINE_SERALE_TOKEN`)

Il giro serale NBA ricontrolla infortuni e notizie delle giocate NBA prima che le partite inizino. Lo avvia una GitHub Action, che ha bisogno dell'indirizzo e del codice della routine:

1. Apri claude.ai/code/routines e apri la routine **"Giro serale"**.
2. Premi **Edit** → **Add another trigger** → **API**.
3. Copia l'URL e premi **Generate token** (il token si vede una volta sola).
4. Nei segreti di GitHub crea `ROUTINE_SERALE_URL` (l'URL) e `ROUTINE_SERALE_TOKEN` (il token).

Senza questi due segreti le quote serali vengono salvate ma la routine non parte.

### Gli orari della sera

- **Giro serale** (NBA, ed è anche il giro della sera prima del tennis, vedi sotto): di norma alle 22:00; se quel giorno c'è una partita prima delle 22:30, un'ora prima della prima partita, mai prima delle 14:00. Parte entro un'ora dall'orario previsto. Le istruzioni della routine sono in `docs/routine/giro-serale.md`.
- Se due ore dopo l'orario previsto il controllo non c'è stato, le schede NBA non iniziate mostrano l'avviso "controllo serale non eseguito".

### Cosa significano le scritte sulle schede NBA

- **Confermata**: il controllo serale non ha trovato novità che cambino la giocata.
- **Modificata**: una notizia dell'ultima ora ha cambiato la probabilità. La scheda mostra la nuova quota minima e il motivo: gioca solo se trovi quella quota o una più alta.
- **Annullata**: non giocarla più (per esempio è fuori un titolare importante). La scheda mostra il motivo.
- Se hai già premuto "Giocata", la puntata e la quota minima restano quelle di quando l'hai fatta, anche se il controllo serale la segna Modificata o Annullata: in quel caso è solo un avviso, perché la giocata è già stata fatta.
- **Stessa linea su bet365**: le schede di Handicap e Totale punti dicono, in sostanza, "Gioca solo con la stessa linea e quota almeno la minima; con una linea diversa il calcolo non vale". Se su bet365 la linea è diversa (per esempio 220.5 invece di 221.5), il calcolo non vale: non giocare.

## Tennis: mercato, ritiri e giro della sera prima

Le giocate di tennis si costruiscono ogni mattina insieme a quelle di calcio e NBA, con dati gratuiti. **Non servono chiavi nuove**: il tennis usa la stessa chiave di The Odds API del calcio (`ODDS_API_KEY`), e lo storico delle partite viene da tennis-data.co.uk, che è gratuito e senza chiave ma va caricato a mano (vedi "Lo storico caricato a mano"). Se i crediti giornalieri di The Odds API non bastano per un torneo, quel torneo resta scoperto e la pagina lo dice.

### Il mercato

C'è un solo mercato: **Vincente incontro**, cioè chi vince la partita. La scheda spiega in parole semplici come si gioca. Game, set, handicap e risultato esatto non ci sono: non esistono quote gratuite affidabili.

### Lo storico caricato a mano

tennis-data.co.uk è protetto da Cloudflare, che blocca le richieste dai server: la raccolta automatica (GitHub Actions e routine) riceve `HTTP 403`. Senza storico il modello Elo non si calcola e le partite restano "solo Pinnacle", cioè senza giocate.

Per questo i file dello storico si caricano a mano, da browser, nella cartella `data/storico-tennis/`. Se un file c'è, la raccolta usa quello e non prova a scaricarlo; se manca, prova a scaricarlo e, se riceve 403, l'errore della giornata dice quale file caricare.

| File | Dove si trova su tennis-data.co.uk (pagina "All data") |
|---|---|
| `data/storico-tennis/atp/2026.xlsx` | uomini, 2026 |
| `data/storico-tennis/atp/2025.xlsx` | uomini, 2025 |
| `data/storico-tennis/atp/2024.xlsx` | uomini, 2024 |
| `data/storico-tennis/wta/2026.xlsx` | donne, 2026 |
| `data/storico-tennis/wta/2025.xlsx` | donne, 2025 |
| `data/storico-tennis/wta/2024.xlsx` | donne, 2024 |

Il nome resta quello del sito (`2026.xlsx`): conta solo la cartella, `atp` o `wta`. I file del 2024 e del 2025 si caricano una volta sola; quelli del 2026 vanno ricaricati più o meno **una volta a settimana**, così l'Elo include le partite recenti. Gli esiti delle giocate non dipendono da questi file: se lo storico è vecchio, si prendono dai risultati di The Odds API, se i crediti lo permettono.

Dal telefono: apri tennis-data.co.uk, scarica i file, poi su github.com apri il repository (in "versione desktop" se serve), entra in `data/storico-tennis/wta` (o `atp`), tocca **Add file → Upload files**, scegli il file e conferma con **Commit changes** su `main`. Se esiste già un file con lo stesso nome, viene sostituito.

### I ritiri

Se un giocatore si ritira durante la partita:

- con **almeno un set completato** vince chi passa il turno;
- **prima della fine del primo set**, oppure se la partita non si gioca (walkover), la giocata è **rimborsata**.

Questa è una scelta del progetto. **Se il regolamento di bet365 è diverso, vale quello di bet365**, non quello scritto qui: controllalo prima di giocare.

### I tornei coperti

Sono i tornei ATP e WTA che The Odds API indica come attivi, di solito i principali: Slam, ATP Masters 1000, ATP 500, WTA 1000 e WTA 500, ATP Finals, Coppa Davis e Billie Jean King Cup. I tornei minori (ATP 250, Challenger, ITF) di solito non ci sono. Gli Slam maschili si giocano al meglio dei 5 set, tutto il resto al meglio dei 3.

### Il giro della sera prima

Nel tennis molte partite iniziano di notte o all'alba (tornei in Asia e Australia). Per non perderle, lo stesso giro serale dell'NBA aggiunge alla giornata di oggi le partite che iniziano dopo l'orario serale e prima delle 08:00 del giorno dopo. Funziona così:

- una GitHub Action scarica le quote fresche e salva le partite notturne;
- la routine "Giro serale" controlla le notizie su quelle partite (ritiri, infortuni, partite lunghe del giorno prima) e poi le aggiunge alla giornata;
- le giocate già proposte non cambiano mai. Le nuove sono solo singole, e il limite di 10 singole al giorno vale anche con quelle della sera;
- se ci sono solo partite di tennis (nessuna giocata NBA), la routine parte lo stesso alle 22:00. Le istruzioni sono in `docs/routine/giro-serale.md`.

Se la parte tennis fallisce, il motivo compare tra gli errori della giornata e il resto va avanti.

## Basket: Eurolega e NBL

Le giocate di basket europeo e australiano si costruiscono ogni mattina insieme agli altri sport. **Non servono chiavi nuove**: le quote vengono da The Odds API con la stessa `ODDS_API_KEY` del calcio, e lo storico dalle fonti gratuite:

- **Eurolega**: l'API pubblica dei risultati della Eurolega (senza chiave);
- **NBL**: TheSportsDB, piano gratuito (senza chiave).

Lo storico si salva in `data/storico/eurolega.json` e `data/storico/nbl.json`: la stagione precedente si scarica una volta sola, quella in corso si aggiorna ogni mattina dall'ultima giornata salvata. Se una fonte non risponde, lo storico già salvato resta e l'errore compare nella pagina.

### Mercati

Gli stessi dell'NBA: **Vincente**, **Handicap** e **Totale punti**, supplementari compresi e con la stessa linea indicata sulla scheda (con una linea diversa il calcolo non vale). Il riferimento di mercato è Pinnacle sulla stessa linea; se Pinnacle ha un'altra linea, la media senza margine di almeno 3 bookmaker su quella linea.

### Crediti

Ogni campionato con partite costa 3 crediti di The Odds API al giorno. Il basket spende dopo calcio e tennis e lascia da parte la serata del tennis: nei giorni pieni un campionato può restare scoperto, e la pagina lo dice ("crediti insufficienti"). Prima l'Eurolega, poi l'NBL.

### Le partite "solo mercato"

Se una squadra ha meno di 8 partite salvate (per esempio una squadra nuova), la partita non ha il modello e usa solo il mercato: una giocata nasce solo se la quota mediana batte di almeno il 5% la quota giusta, cosa rara.

### Le partite NBL dell'alba

Le partite NBL iniziano di solito tra le 08:00 e le 11:00 italiane, ma alcune iniziano di notte. La raccolta del mattino prende tutte le partite fino alle 08:00 del giorno dopo, quindi anche quelle notturne entrano nella giornata del giorno prima. Una partita fra le 00:00 e le 08:00 del giorno stesso è già iniziata quando parte il giro e resta scoperta.

## Pallavolo

Le giocate di pallavolo si costruiscono ogni mattina insieme agli altri sport.

### La chiave OddsPapi

Le quote vengono da **OddsPapi**, piano gratuito: 250 richieste al mese. La chiave (`ODDSPAPI_API_KEY`) va tra i secrets del repository, come le altre (Settings → Secrets and variables → Actions). Un solo account: aprirne altri per avere più richieste è vietato dai termini d'uso.

Ogni mattina si spende 1 richiesta per l'elenco delle partite (tutti i campionati insieme) e 1 per le quote di ogni partita, fino al budget del giorno: (richieste rimaste − 20% di riserva) diviso i giorni che restano nel mese, circa 6-8 al giorno. Le partite si scelgono per priorità del campionato e poi per orario; quelle rimaste fuori compaiono nella pagina come "richieste OddsPapi finite". Il conteggio del mese si legge dal conto OddsPapi e si tiene anche in `data/stato/oddspapi.json`.

Per ricontrollare a mano cosa copre OddsPapi (circa 5 richieste) c'è l'Action "Collaudo OddsPapi pallavolo".

### Campionati

In ordine di priorità: SuperLega, Champions League maschile e femminile, Serie A1 femminile, PlusLiga, Efeler Ligi (Turchia), Bundesliga. Lo storico gratuito viene da TheSportsDB e si salva in `data/storico/pallavolo-<campionato>.json`. Un campionato senza storico gratuito della stagione in corso resta fuori, perché gli esiti non si chiuderebbero: per ora la Champions League (TheSportsDB non la ha) e la Serie A1 femminile (TheSportsDB non ha ancora la stagione 2026-27; entrerà da sola quando ci sarà).

### Mercati

- **Vincente**;
- **Handicap set -1,5 / +1,5** (riferito alla squadra di casa): la squadra a −1,5 deve vincere 3-0 o 3-1;
- **Totale set 3,5**: Over se si gioca il quarto set, Under se finisce 3-0 o 0-3.

Il modello è un Elo per campionato con il margine in set (3-0 pesa più di 3-2), con le due ultime stagioni. Sulla scheda, accanto alla quota mediana, c'è la **quota bet365** quando OddsPapi la dà. Il value si calcola sulla quota più bassa fra la mediana e bet365, così una giocata non nasce solo perché la mediana è più alta di quello che paga bet365. Per ora tutti i mercati, vincente compreso, usano solo il mercato (Pinnacle o il consenso): l'Elo compare sulla scheda solo come informazione finché non sarà tarato sui risultati. Una squadra con meno di 20 partite salvate non ha nemmeno l'Elo. Gli esiti si assegnano solo con un risultato in set valido (3-0, 3-1, 3-2).

## Controlli prima delle partite

L'Action "Controlli prima delle partite" (pianificata ogni 10 minuti, ma GitHub la fa partire in pratica ogni 30-43 minuti) guarda le giocate di oggi che stanno per iniziare, una per una:

| Sport | Primo tentativo | Ultimo tentativo |
|---|---|---|
| Calcio | 90 minuti prima | da 45 minuti prima |
| Tennis, pallavolo | 90 minuti prima | da 45 minuti prima |
| NBA, basket | 75 minuti prima | da 45 minuti prima |

Cosa controlla:

- **Formazioni** (calcio) e **infortuni** (NBA) da ESPN, gratis: i giocatori chiave indicati dal giro del mattino devono essere titolari (calcio) o non "Out" (NBA). Se le formazioni non sono ancora uscite si riprova; all'ultimo tentativo si decide con i dati del mattino e la scheda lo dice.
- **Ritiri e rinvii**: se la partita non si trova più nella fonte delle quote la giocata va **In revisione** (può essere un ritiro, un rinvio o solo un nome scritto in modo diverso): non si annulla mai da sola, controlla tu su bet365.
- **Quote**: una richiesta per competizione (dentro la riserva di crediti già tenuta da parte). Quota sotto la minima, o Pinnacle mosso contro di più di 5 punti → revisione.

Se non cambia niente la giocata diventa **Confermata**, con cosa si è controllato. Se cambia qualcosa va **In revisione** e, al massimo 2 volte al giorno, parte la routine Claude "Controllo pre-partita", che rianalizza solo quella partita (istruzioni in `docs/routine/controllo-pre-partita.md`). Senza Claude, o se la giocata è ancora in revisione al primo passaggio a meno di 45 minuti dall'inizio (con il cron irregolare può essere l'ultimo), valgono le regole fisse: giocatore chiave fuori o quota sotto la minima → **Annullata**; partita non trovata nelle quote → resta **In revisione**; il solo movimento di Pinnacle → Confermata con l'avviso. Una decisione di Claude arrivata a partita iniziata non si applica e finisce fra gli errori della giornata. Ogni cambio di stato arriva anche su Telegram.

### La routine "Controllo pre-partita" (`ROUTINE_CONTROLLI_URL` e `ROUTINE_CONTROLLI_TOKEN`)

1. Apri claude.ai/code/routines e apri la routine **"Controllo pre-partita"**.
2. Premi **Edit** → **Add another trigger** → **API**.
3. Copia l'URL e premi **Generate token** (il token si vede una volta sola).
4. Nei segreti di GitHub crea `ROUTINE_CONTROLLI_URL` (l'URL) e `ROUTINE_CONTROLLI_TOKEN` (il token).

Senza questi due segreti i controlli funzionano lo stesso, solo con le regole fisse.

## Notifiche Telegram

Un bot Telegram ti scrive:

- **le giocate del giorno**, dopo il giro del mattino (o una riga se non ce ne sono), e le giocate nuove aggiunte più tardi (per esempio il tennis della sera);
- **i cambi del giro serale**: giocata confermata, modificata (con la quota nuova) o annullata, con il motivo;
- **gli errori del sistema**: righe nuove fra gli errori della giornata, un'Action fallita o annullata, la giornata non scritta entro le 12:00.

- **gli esiti** (vinta, persa, rimborsata) **solo delle giocate segnate come fatte** sul sito, con la quota e la puntata reali, il guadagno o la perdita e il bankroll aggiornato. Le giocate saltate o non segnate non mandano niente.
  Gli esiti arrivano **10-20 minuti dopo la fine della partita**: ogni 10 minuti l'Action dei controlli cerca il risultato delle giocate fatte già finite su fonti gratuite (ESPN per calcio, NBA e tennis; API Eurolega; TheSportsDB per NBL e pallavolo). Se una fonte non ha ancora il risultato, l'esito arriva la mattina dopo con la raccolta delle 07:35, come prima. **Angoli e cartellini** non si chiudono subito, perché ESPN li conta in modo diverso da bet365 (per esempio il doppio giallo): a fine partita arriva solo un esito **provvisorio** ("probabilmente vinta (5 cartellini secondo ESPN, conteggio da confermare)"), che non cambia il bankroll; l'esito vero arriva la mattina dopo.

Ogni messaggio parte una volta sola (lo stato è in `data/stato/telegram.json`). Le righe solo informative ("partite già iniziate", i 429 di TheSportsDB mentre lo storico si completa) non si notificano.

### Come attivarle

1. Su Telegram apri **@BotFather**, scrivi `/newbot` e scegli un nome: ti dà un **token**.
2. Apri la chat col tuo bot e scrivigli un messaggio qualunque.
3. Nel browser apri `https://api.telegram.org/bot<TOKEN>/getUpdates` (con il tuo token): il numero dopo `"chat":{"id":` è il tuo **chat id**.
4. Su GitHub, Settings → Secrets and variables → Actions: aggiungi `TELEGRAM_BOT_TOKEN` (il token) e `TELEGRAM_CHAT_ID` (il numero).

Senza i due secrets le notifiche restano spente e nulla si blocca. Se il chat id è sbagliato (Telegram risponde "chat not found") l'Action "Notifiche Telegram" fallisce con un messaggio che lo dice: correggi `TELEGRAM_CHAT_ID`. L'Action "Notifiche Telegram" parte dopo ogni aggiornamento dei dati e dopo le altre Action; si può anche avviare a mano.

## Revisione settimanale

Ogni lunedì mattina (alle 10:37 con l'ora legale, alle 09:37 con l'ora solare) una routine di Claude analizza la settimana appena chiusa e scrive un rapporto in `docs/report/settimana-<data>.md`: risultati, cosa funziona e cosa no, salute del sistema e al massimo 5 proposte di miglioramento. Non cambia niente da sola: le proposte le decidi tu. Le istruzioni sono in `docs/routine/revisione-settimanale.md`.

## Per chi sviluppa (fasi successive)

- Il giro del mattino **deve** scrivere in `data/giornate/AAAA-MM-GG.json` sia `giocate` sia `scartate`. Se manca `giocate`, la build rifà la selezione in memoria solo per la giornata di oggi, come ripiego per mostrare la pagina; per le giornate passate segnala l'errore "Giornata <data> senza giocate: il giro del mattino deve scriverle", e le segnature di quelle giocate compaiono come "Segnatura senza giocata".
- Valori ammessi per `sport`: esattamente `calcio`, `tennis`, `nba`, `basket`, `pallavolo` (sono i filtri della pagina). Le partite NBA usano `nba`; `basket` è per gli altri campionati.
- Un file con dati sbagliati non blocca la build: viene saltato e la pagina mostra "Dati non validi in <file>: <errore>". La pagina mostra anche l'ora dei dati e avvisa se hanno più di 2 ore.
- `esito` di giocate e gambe lo scrivono solo gli esiti (giro del mattino ed esiti rapidi). Per cartellini e angoli del calcio gli esiti rapidi scrivono solo `esitoProvvisorio: { esito, dettaglio }` (numeri di ESPN, da confermare): non conta per bankroll e stop, serve solo alla notifica Telegram.
- Controlli prima delle partite (Fase 3): progetto in `docs/superpowers/specs/2026-10-21-fase-3-controlli-design.md`, codice in `src/controlli/`.
- Pallavolo (Fase 4d): progetto in `docs/superpowers/specs/2026-10-21-fase-4d-pallavolo-design.md`, codice in `src/pallavolo/`.
- Basket (Fase 4c): progetto in `docs/superpowers/specs/2026-10-21-fase-4c-basket-design.md`, codice in `src/basket/`.
- Calcio (Fase 2): progetto in `docs/superpowers/specs/2026-10-19-fase-2-calcio-design.md`, piano in `docs/superpowers/plans/2026-10-19-fase-2-calcio.md`, istruzioni della routine in `docs/routine/giro-del-mattino.md`.
- Modello dati completo: `docs/superpowers/plans/2026-10-19-fase-1-fondamenta.md`, sezione "Modello dati".

## Avvertenza

Nulla garantisce vincite. Gioca con responsabilità, solo entro il bankroll di 200 € e rispettando lo stop settimanale di −50 €.
