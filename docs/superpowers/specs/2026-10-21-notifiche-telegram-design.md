# Notifiche Telegram

*Data: 21 ottobre 2026 · Stato: eventi scelti dall'utente il 21 ottobre 2026*

Prima delle "idee per dopo" del documento di progetto (§10).

## Cosa si notifica [utente]

- Giocate del giorno (dopo il giro del mattino) e giocate nuove aggiunte più tardi.
- Cambi del giro serale: confermata, modificata, annullata.
- Errori del sistema.

Esiti (aggiunti il 21/10/2026 **[utente]**): vinta, persa, rimborsata, **solo delle giocate segnate come fatte** (ultima segnatura con `fatta: true`), con quota e puntata reali, guadagno o perdita e bankroll aggiornato con le regole del sito. Si guardano le giornate degli ultimi 13 giorni.

Esito provvisorio di cartellini e angoli (aggiunto il 21/10/2026 **[utente]**): gli esiti rapidi (`src/esiti/rapidi.js`, dentro i controlli) non chiudono questi mercati, perché ESPN conta i cartellini in modo diverso da bet365/football-data; a partita finita (STATUS_FULL_TIME) scrivono solo `esitoProvvisorio: { esito, dettaglio }` sulla giocata o sulla gamba, mai `esito`, e il bankroll non cambia. Telegram lo manda una volta per gamba (chiave `<data>|provvisorio|<id>|<gamba>`), solo per le giocate fatte e senza esito definitivo, per esempio "Levante - Athletic Bilbao, Cartellini Under 3,5: probabilmente vinta (5 cartellini secondo ESPN, conteggio da confermare)". L'esito definitivo resta quello del giro del mattino (`src/calcio/esiti.js`).

## Come [scelta di Claude]

- Action `notifiche.yml`: dopo ogni push su `main` che tocca `data/giornate` o `data/raccolta` (le routine di Claude), alla fine di raccolta, riserva, giro serale e pubblicazione oraria (`workflow_run`), e a mano. Gruppo di concorrenza proprio, `notifiche` (cancel-in-progress: false): non aspetta né blocca le Action dei dati; lo stato si salva con `pull --rebase` e fino a 3 tentativi, anche quando l'invio fallisce (`if: always()`), così i messaggi già partiti restano segnati.
- `src/notifiche/telegram.js` legge la giornata di oggi (08:00-08:00) e confronta con `data/stato/telegram.json` (chiavi già mandate, ultimi 14 giorni): ogni messaggio parte una volta sola.
- Errori: le righe nuove di `erroriGiro`, tranne quelle solo informative ("partite già iniziate", 429 di TheSportsDB), anche quelle della giornata precedente (controlli ed esiti rapidi, prima del giro del mattino, scrivono nell'ultima giornata salvata), ognuna una volta sola; un'Action fallita o annullata (dal `workflow_run`); la giornata di oggi non scritta dopo le 12:00.
- Bot e chat dell'utente nei secrets `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`; senza i secrets le notifiche sono spente. Il token non compare mai nei log né negli errori; della chat il log dice solo se Telegram la trova (ok / non ok), mai nome né numero. Se Telegram risponde "chat not found" l'Action fallisce con un messaggio chiaro: nessun ripiego su altre chat (mai una chat presa da getUpdates).
- Messaggi in HTML di Telegram, brevi, leggibili da telefono, con il link al sito. Sopra i 4000 caratteri si dividono sulle righe; su HTTP 429 si aspetta `retry_after` (al massimo 60 s) e si riprova una volta; un messaggio che non parte non blocca gli altri, ma alla fine l'Action fallisce perché si veda.
