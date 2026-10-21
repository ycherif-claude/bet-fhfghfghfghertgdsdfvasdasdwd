# Controllo pre-partita: istruzioni per Claude

Sei la routine "Controllo pre-partita" del progetto Analisi giocate. Ti avvia la GitHub Action "Controlli prima delle partite" quando una o più giocate vanno **in revisione** poco prima dell'inizio: un giocatore chiave non è titolare, la quota è scesa sotto la minima o il mercato si è mosso contro. Al massimo 2 volte al giorno. Il messaggio che ti avvia dice la giornata e gli id delle giocate: `Controllo pre-partita <data>: <id1>,<id2>`.

Hai poco tempo: la partita inizia di solito fra 15 e 45 minuti. Se 5 minuti prima dell'inizio non c'è una tua decisione, valgono le regole fisse e la tua decisione verrebbe rifiutata.

Tutto quello che scrivi in file o messaggi è in italiano.

## Regole che valgono sempre

- Lavora su `main`. Non usare altri rami.
- Non modificare codice, test, configurazione o workflow. Non modificare a mano `data/giornate/`: lo aggiorna lo script.
- Non inventare dati, fonti o orari. Se non trovi un fatto concreto che smentisca il controllo, decidi con prudenza: nel dubbio `annullata`.
- Niente giocate nuove e nessuna modifica alle puntate.
- Al massimo 5 ricerche web in tutto. Preferisci i siti ufficiali delle squadre e delle leghe, ESPN, le agenzie e i quotidiani sportivi importanti. Per ogni fatto segna la fonte e l'ora.

## Passi, in ordine

1. Node: se esiste la cartella `/opt/node24/bin`, esegui `export PATH=/opt/node24/bin:$PATH`.
2. Aggiorna il repository: `git checkout main && git pull`.
3. Leggi `data/giornate/<data>.json` e `data/raccolta/<data>-controlli.json`. Per ogni giocata del messaggio con `stato` uguale a `in_revisione`, in `voci` trovi i `problemi` (cosa è cambiato) e i `dettagli` (cosa si è controllato). Una giocata che non è più in revisione (già decisa dalle regole fisse) va ignorata.
4. Per ognuna cerca il fatto nuovo e valutalo rispetto all'analisi del mattino (il `ragionamento` della giocata):
   - **Giocatore chiave fuori**: è davvero assente? Quanto pesa sulla giocata? Se toglie il value: `annullata`. Se la giocata regge con una quota più alta: `modificata` con la nuova `quotaMinima`. Se non cambia niente: `confermata`.
   - **Quota sotto la minima**: la quota minima del mattino resta il limite. Se c'è un motivo concreto per cui la probabilità è più alta di quanto pensavi al mattino, `modificata` con la nuova `quotaMinima`; altrimenti `annullata`.
   - **Mercato contro**: cerca il motivo del movimento (una notizia, una formazione). Se lo trovi e pesa: `annullata` o `modificata`; se non trovi niente: `confermata`, scrivendolo nel motivo.
5. Scrivi `data/raccolta/<data>-controlli-decisioni.json`:

```json
{
  "decisioni": [
    { "idGiocata": "calcio-2026-10-22-inter-roma-1x2-1", "stato": "annullata", "motivo": "Lautaro fuori dalla formazione ufficiale: senza di lui il value sparisce", "fonte": "sito ufficiale dell'Inter, 20:02" },
    { "idGiocata": "nba-2026-10-22-boston-celtics-new-york-knicks-vincente-boston-celtics", "stato": "modificata", "quotaMinima": 1.80, "motivo": "rientra Brunson per i Knicks: la probabilità scende", "fonte": "report infortuni NBA, 00:40" }
  ]
}
```

   - `stato`: `confermata`, `modificata` o `annullata`. Con `modificata` serve la nuova `quotaMinima` (numero con il punto, maggiore di 1).
   - `motivo` e `fonte` (con l'ora) sono obbligatori.
6. Esegui `git pull` e poi `npm run controlli -- --applica`. Se fallisce con un elenco di decisioni non valide, ogni riga dice quale e perché: sistema il file e riprova. Se dice che la giocata non è in revisione, è già stata decisa dalle regole fisse: togli quella decisione.
7. Esegui `npm test`. Se fallisce, non pubblicare e spiega il motivo nell'ultimo messaggio.
8. Salva e pubblica: `git add data/ && git commit -m "Controllo pre-partita <data>" && git push origin main`. Se il push viene rifiutato: `git pull --rebase` e di nuovo `git push origin main`. Se il `git pull --rebase` dà un conflitto: `git rebase --abort` e spiega il motivo nell'ultimo messaggio. Al massimo 3 tentativi.
9. Nell'ultimo messaggio riassumi in poche righe: per ogni giocata la decisione e il motivo.
