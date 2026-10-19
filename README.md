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

## Per chi sviluppa (fasi successive)

- Il giro del mattino **deve** scrivere in `data/giornate/AAAA-MM-GG.json` sia `giocate` sia `scartate`. Se manca `giocate`, la build rifà la selezione in memoria solo per la giornata di oggi, come ripiego per mostrare la pagina; per le giornate passate segnala l'errore "Giornata <data> senza giocate: il giro del mattino deve scriverle", e le segnature di quelle giocate compaiono come "Segnatura senza giocata".
- Valori ammessi per `sport`: esattamente `calcio`, `tennis`, `nba`, `basket`, `pallavolo` (sono i filtri della pagina). Le partite NBA usano `nba`; `basket` è per gli altri campionati.
- Un file con dati sbagliati non blocca la build: viene saltato e la pagina mostra "Dati non validi in <file>: <errore>". La pagina mostra anche l'ora dei dati e avvisa se hanno più di 2 ore.
- Calcio (Fase 2): progetto in `docs/superpowers/specs/2026-10-19-fase-2-calcio-design.md`, piano in `docs/superpowers/plans/2026-10-19-fase-2-calcio.md`, istruzioni della routine in `docs/routine/giro-del-mattino.md`.
- Modello dati completo: `docs/superpowers/plans/2026-10-19-fase-1-fondamenta.md`, sezione "Modello dati".

## Avvertenza

Nulla garantisce vincite. Gioca con responsabilità, solo entro il bankroll di 200 € e rispettando lo stop settimanale di −50 €.
