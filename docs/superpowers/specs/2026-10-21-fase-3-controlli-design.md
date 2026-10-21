# Fase 3 – Controlli prima delle partite

*Data: 21 ottobre 2026 · Stato: approvato dall'utente il 21 ottobre 2026*

Realizza il §6.2 del documento di progetto con l'architettura ibrida del §3: un programma leggero su GitHub Actions controlla **ogni partita con una giocata**, una per una (niente raggruppamenti, **[utente]**), conferma da solo se non cambia niente e attiva Claude solo quando qualcosa cambia. Gli esiti sono già raccolti sport per sport (Fasi 2 e 4) e non cambiano.

Legenda: **[utente]** = deciso dall'utente; **[scelta di Claude]** = deciso da Claude, modificabile.

## 1. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- Ogni giocata della giornata (tutti gli sport) passa da "In attesa formazioni" a **Confermata**, **Modificata** o **Annullata** prima dell'inizio, sempre con il motivo scritto.
- Il programma leggero controlla formazioni, ritiri e quote; Claude rifà l'analisi solo delle partite "in revisione", nei limiti del piano Pro.
- Se Claude non è disponibile, regole semplici scritte in anticipo, dichiarate sulla scheda.

**Non-obiettivi (per ora)**
- Aggiungere giocate nuove al controllo (il §6.2 lo permette): si valuterà dopo, perché richiede la selezione completa con i tetti già usati.
- Meteo automatico: resta compito delle notizie del mattino.

**Anti-obiettivi**
- Cambiare una giocata senza motivo scritto.
- Spendere i crediti delle quote oltre la riserva del 20% già tenuta da parte per questa fase (Fase 2 §budget).
- Avviare Claude oltre il tetto giornaliero.

## 2. Quando

Una Action `controlli.yml` gira **ogni 10 minuti** (repository pubblico: minuti gratuiti). A ogni passaggio prende le giocate di oggi non annullate e non ancora controllate la cui partita inizia entro la sua finestra **[scelta di Claude]**:

| Sport | Primo tentativo | Ultimo tentativo |
|---|---|---|
| Calcio | 50 min prima (formazioni a ~60 min) | 15 min prima |
| Tennis, pallavolo | 45 min prima | 15 min prima |
| NBA, basket | 35 min prima | 10 min prima |

Le Action pianificate di GitHub possono partire con qualche minuto di ritardo: per questo la finestra è larga. Se le formazioni non sono ancora uscite, si riprova al passaggio successivo; all'ultimo tentativo si decide con quello che c'è e la scheda scrive "formazioni non uscite: valutata sui dati del mattino" (§6.2 del progetto).

## 3. Cosa controlla il programma leggero

**Formazioni e assenze** (gratis):
- **Calcio e NBA: ESPN** (`site.api.espn.com`, senza chiave; verificato il 21/10/2026: formazioni titolari della Liga). API non ufficiale: se non risponde, il controllo usa solo le quote e lo scrive.
- **Giocatori chiave:** il giro del mattino li scrive per ogni partita con giocate nel file notizie (campo nuovo, facoltativo, `giocatoriChiave`: per `idPartita`, i nomi dei titolari da cui dipende la giocata). Un giocatore chiave **non titolare** → la partita va in revisione.
- **Tennis:** la partita sparisce dagli eventi di The Odds API (gratuito) o risulta un ritiro → giocata annullata ("ritiro o partita non in programma").
- **Basket europeo e pallavolo:** niente formazioni gratuite affidabili: solo quote.

**Quote** (una richiesta per competizione, non per giocata):
- Calcio, tennis, basket: The Odds API (stessi crediti della raccolta, dentro la riserva del 20%); NBA: SportsGameOdds; pallavolo: OddsPapi (1 richiesta per partita, dentro il budget del giorno).
- **Quota mediana sotto la quota minima** → revisione.
- **Pinnacle (o il consenso) contro di noi di più di 5 punti** di probabilità rispetto al mattino → revisione. Un movimento a favore non cambia niente.

**Se non cambia niente:** Confermata, con l'ora del controllo e cosa si è controllato ("formazioni ufficiali: tutti i giocatori chiave titolari; quota 1,95 ≥ minima 1,85").

## 4. Claude per le partite in revisione

- La giocata passa a **"In revisione"** con il motivo.
- L'Action avvia una routine Claude "Controllo pre-partita" (stesso meccanismo `/fire` del giro serale, con i suoi secrets), che rifà l'analisi **solo di quella partita** con il fatto nuovo e scrive una decisione: confermata, modificata (nuova quota minima o nuova puntata) o annullata, con motivo e fonte. Le decisioni si applicano con lo stesso codice del giro serale.
- **Tetto: al massimo 2 avvii di Claude al giorno** (`CONFIG.controlli.maxClaude`) **[utente]**, oltre alle routine del mattino, della sera e della revisione settimanale.
- **Se Claude non è disponibile** (tetto raggiunto, routine non partita, nessuna decisione entro 5 minuti dall'inizio), valgono le regole fisse, dichiarate sulla scheda ("regola automatica: Claude non disponibile"):
  - giocatore chiave fuori → **Annullata**;
  - quota sotto la minima → **Annullata**;
  - Pinnacle contro di più di 5 punti → **Confermata con l'avviso** (il movimento da solo non annulla) **[utente]**;
  - fonte delle formazioni giù → resta la valutazione del mattino, **Confermata** con l'avviso.

## 5. Dati e pagina

- Campi già nel modello dati (Fase 1): `stato` (`in_attesa`, `in_revisione` nuovo, `confermata`, `modificata`, `annullata`), `motivoStato`, `oraUltimoControllo`. Per `modificata`: `quotaMinima`, `prob` e, se cambia, la puntata (rispettando il tetto giornaliero).
- File del controllo: `data/raccolta/<data>-controlli.json` (cosa si è controllato, per partita, con fonte e ora), utile alla revisione settimanale.
- Le giocate già segnate dall'utente: "Annullata" compare come avviso (la giocata è già fatta), come nel giro serale.
- **Notifiche Telegram:** ogni cambio di stato del controllo (in revisione, confermata, modificata, annullata) parte come quelli del giro serale.
- **NBA:** il giro serale resta; il controllo pre-partita aggiunge quintetti e quote dell'ultimo momento.

## 6. Rischi

- **ESPN non ufficiale:** può cambiare o bloccare. Ripiego: solo quote, dichiarato.
- **Ritardi delle Action pianificate:** finestre larghe e più tentativi.
- **Crediti:** nei giorni con molte giocate il controllo quote usa la riserva; se finisce, il controllo usa solo le formazioni e lo dice.
- **Tetto di Claude:** nei giorni pieni prevalgono le regole fisse.
