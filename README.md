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
5. Controlla in Actions che "Pubblica sito" termini in verde e apri l'indirizzo del sito: deve mostrare la giornata d'esempio.
6. Dal telefono inserisci repository e token in Impostazioni. Premi "Giocata" su una scheda: deve comparire un file in `data/segnature/` e, dopo la ripubblicazione, il bankroll si aggiorna. "Annulla segnatura" lo riporta al valore precedente.

## Avvertenza

Nulla garantisce vincite. Gioca con responsabilità, solo entro il bankroll di 200 € e rispettando lo stop settimanale di −50 €.
