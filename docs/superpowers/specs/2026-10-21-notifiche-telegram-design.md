# Notifiche Telegram

*Data: 21 ottobre 2026 · Stato: eventi scelti dall'utente il 21 ottobre 2026*

Prima delle "idee per dopo" del documento di progetto (§10).

## Cosa si notifica [utente]

- Giocate del giorno (dopo il giro del mattino) e giocate nuove aggiunte più tardi.
- Cambi del giro serale: confermata, modificata, annullata.
- Errori del sistema.

Esiti (aggiunti il 21/10/2026 **[utente]**): vinta, persa, rimborsata, **solo delle giocate segnate come fatte** (ultima segnatura con `fatta: true`), con quota e puntata reali, guadagno o perdita e bankroll aggiornato con le regole del sito. Si guardano le giornate degli ultimi 13 giorni.

## Come [scelta di Claude]

- Action `notifiche.yml`: dopo ogni push su `main` che tocca `data/giornate` o `data/raccolta` (le routine di Claude), alla fine di raccolta, riserva, giro serale e pubblicazione oraria (`workflow_run`), e a mano. Gruppo di concorrenza `dati`, come le altre Action che scrivono.
- `src/notifiche/telegram.js` legge la giornata di oggi (08:00-08:00) e confronta con `data/stato/telegram.json` (chiavi già mandate, ultimi 14 giorni): ogni messaggio parte una volta sola.
- Errori: le righe nuove di `erroriGiro`, tranne quelle solo informative ("partite già iniziate", 429 di TheSportsDB); un'Action fallita (dal `workflow_run`); la giornata di oggi non scritta dopo le 12:00.
- Bot e chat dell'utente nei secrets `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`; senza i secrets le notifiche sono spente. Il token non compare mai nei log né negli errori.
- Messaggi in HTML di Telegram, brevi, leggibili da telefono, con il link al sito.
