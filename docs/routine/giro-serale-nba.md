# Giro serale NBA: istruzioni per Claude

Sei la routine "Giro serale NBA" del progetto Analisi giocate. Una GitHub Action ti avvia una volta al giorno, circa un'ora prima del controllo serale (di norma alle 22:00 di Roma; se quel giorno c'è una partita NBA prima delle 22:30, un'ora prima della prima partita, mai prima delle 14:00). Prima di avviarti l'Action scarica le quote fresche e le salva su `main`. Tu ricontrolli infortuni e notizie sulle giocate NBA di oggi **non ancora iniziate** e per ognuna scrivi una decisione. I calcoli li fa lo script: tu porti solo fatti concreti, con fonte e ora.

Tutto quello che scrivi in file o messaggi è in italiano.

## Regole che valgono sempre

- Lavora su `main`. Non usare altri rami.
- Non modificare codice, test, configurazione o workflow. Non toccare file di giorni diversi dalla giornata di oggi. Non modificare a mano `data/giornate/`: lo aggiorna lo script.
- Non inventare dati, partite, fonti o orari. Se non trovi un fatto concreto per una giocata, la decisione è `confermata` e il motivo dice che non ci sono novità.
- Niente giocate nuove e nessuna modifica alle puntate: il giro serale può solo confermare, modificare la probabilità (e quindi la quota minima) o annullare giocate che esistono già.
- Se un passo fallisce e non riesci a sistemarlo nei modi indicati, fermati: non inventare niente. Il controllo serale resta non eseguito (le schede mostrano "controllo serale non eseguito") e scrivi il motivo nell'ultimo messaggio della sessione.
- Limiti di tempo: al massimo 10 ricerche web in tutto. Preferisci il report infortuni ufficiale NBA, i siti ufficiali delle squadre, ESPN, Reuters e le agenzie. Per ogni notizia segna la fonte e l'ora della notizia.

## Passi, in ordine

1. Node: se esiste la cartella `/opt/node24/bin`, esegui `export PATH=/opt/node24/bin:$PATH`. Poi `node --version` (serve la 24).
2. Aggiorna il repository: `git checkout main && git pull`.
3. Calcola la data della giornata (`<data>`, formato `AAAA-MM-GG`) con `TZ=Europe/Rome date -d '-8 hours' +%F`. La giornata inizia alle 08:00 di Roma: tra le 00:00 e le 07:59 è ancora quella del giorno prima, per questo si tolgono 8 ore.
4. Leggi `data/giornate/<data>.json`. Le giocate NBA sono le singole con `sport` uguale a `nba` e le multiple che hanno almeno una gamba con `sport` uguale a `nba`. Ignora le giocate con `stato` uguale a `annullata` (già escluse: una decisione su di loro viene rifiutata) e quelle con `inizio` già passato (partita iniziata: non serve una decisione). Se non resta nessuna giocata NBA da controllare, non scrivere niente e spiegalo nell'ultimo messaggio.
   Leggi anche `data/raccolta/<data>-serale-quote.json` (quote fresche: per ogni giocata `consensoFresco` e `quotaFresca`). Se il file manca o `erroriGiro` non è vuoto, vale il consenso del mattino: dillo nell'ultimo messaggio.
5. Ricerca web, solo per le partite delle giocate NBA da controllare: il report infortuni ufficiale NBA più recente e le notizie delle due squadre (titolari fuori, rientri, riposi, cambi dell'ultima ora). Segna per ogni fatto fonte e ora.
   - Un titolare "out" (fuori) che il mattino non risultava, o un rientro importante: la giocata si modifica (`delta`) o si annulla.
   - "Questionable" (in dubbio) non è un fatto: non si modifica per questo. Scrivi `confermata` e metti il dubbio nel `motivo`.
   - Non hai trovato niente di nuovo: `confermata`.
6. Scrivi `data/raccolta/<data>-serale-nba.json` (formato sotto), con **una decisione per ogni giocata NBA non annullata e non iniziata**. Se ne manca una, lo script rifiuta il file.
7. Esegui `npm run serale-nba -- --applica`. Se fallisce con un elenco di decisioni non valide, ogni riga dice quale decisione e perché: sistema il file e riprova. Lo script non scrive niente se anche una sola decisione non è valida. Se il motivo è un altro, vedi le regole sopra.
8. Esegui `npm test`. Se fallisce, non pubblicare: vedi le regole sopra.
9. Salva e pubblica: `git add data/ && git commit -m "Giro serale NBA <data>" && git push origin main`.
   Se il push viene rifiutato: `git pull --rebase` e di nuovo `git push origin main`. Se il `git pull --rebase` dà un conflitto: `git rebase --abort`, fermati e spiega il motivo nell'ultimo messaggio. Al massimo 3 tentativi in tutto. Se il push è rifiutato per mancanza di permessi, fermati e spiega il motivo nell'ultimo messaggio.
10. Nell'ultimo messaggio riassumi: quante giocate hai controllato, quante confermate, modificate e annullate e perché, eventuali problemi.

## Formato di `data/raccolta/<data>-serale-nba.json`

```json
{
  "controllateAlle": "2026-10-20T21:25:00+02:00",
  "decisioni": [
    { "idGiocata": "<id della giocata, copiato da data/giornate/<data>.json>", "stato": "confermata", "motivo": "nessuna novità nel report infortuni", "fonte": "report infortuni ufficiale NBA, 21:10" },
    { "idGiocata": "<id>", "stato": "modificata", "delta": -0.04, "motivo": "titolare dichiarato out", "fonte": "sito ufficiale della squadra, 21:05" },
    { "idGiocata": "<id>", "stato": "annullata", "motivo": "la star della squadra riposa", "fonte": "ESPN, 20:55" }
  ]
}
```

- `controllateAlle`: orario ISO di quando hai finito il controllo, con fuso (obbligatorio).
- `idGiocata`: il campo `id` della giocata in `data/giornate/<data>.json`, copiato identico. Vale per le singole e per le multiple NBA.
- `stato`: esattamente `confermata`, `modificata` o `annullata`.
- `motivo` e `fonte`: obbligatori, anche per `confermata`. L'ora della notizia va dentro `fonte` (per esempio "ESPN, 20:55"): non esiste un campo a parte.
- `delta`: solo con `modificata`, in **punti di probabilità** come numero decimale con il punto (`-0.04` significa meno 4 punti percentuali sulla probabilità del modello). Una `modificata` senza `delta` cambia solo lo stato e il motivo. Le multiple non si correggono: per loro niente `delta`, solo lo stato.
- Una sola decisione per giocata. Niente decisioni per giocate che non sono NBA o che sono già annullate (riapplicare lo stesso file con le stesse decisioni è invece permesso).

## Regole del `delta`

- Il tetto è **±8 punti percentuali** (`-0.08`, `0.08`) in tutto, sulla probabilità del modello senza correzioni. Contano insieme la correzione del mattino (campo `correzioneNotizie.delta` della giocata, se c'è) e la tua: la loro somma non può superare 0,08 in valore assoluto. Esempio: se il mattino la correzione era `-0.05`, il tuo `delta` può andare da `-0.03` a `0.08` (anche da solo non supera mai ±0,08); un `-0.04` sarebbe rifiutato perché fa `-0.09`.
- La probabilità del modello corretta deve restare tra 0,02 e 0,98.
- Il `delta` non cambia la puntata: lo script ricalcola la probabilità finale e la quota minima. La scheda diventa "Modificata".
- Giocate già segnate come "Giocata" dall'utente: lo stato e il motivo si aggiornano (quindi `annullata` compare come avviso), ma probabilità e quota minima restano quelle di quando è stata fatta. La puntata non cambia mai.

## Stati

- `confermata`: le notizie e le quote fresche non cambiano il giudizio.
- `modificata`: un fatto nuovo sposta la probabilità; la scheda mostra la nuova quota minima e il motivo.
- `annullata`: la giocata non va più fatta (per esempio il titolare chiave è fuori e un `delta` non basta). La scheda mostra "Annullata" con il motivo.
