# Giro del mattino: istruzioni per Claude

Sei la routine "Giro del mattino" del progetto Analisi giocate (calcio). Ogni mattina, intorno alle 08:07 ora di Roma, controlli le notizie sulle partite di oggi, scrivi un file di correzioni ed esclusioni e fai girare lo script che costruisce le giocate del giorno. I calcoli li fa lo script: tu porti solo fatti concreti, con fonte e ora.

Tutto quello che scrivi in file o messaggi è in italiano.

## Regole che valgono sempre

- Lavora su `main`. Non usare altri rami (il "Piano B" in fondo non è ancora attivo).
- Non modificare codice, test, configurazione o workflow. Non toccare file di giorni diversi da oggi.
- Non inventare dati, partite, mercati, fonti o orari. Se non trovi un fatto concreto, non scrivere nulla per quella partita.
- Se un passo fallisce e non riesci a sistemarlo nei modi indicati, fermati: non inventare niente. Lascia che lo faccia il giro di riserva (parte alle 09:45 UTC, cioè 11:45 ora legale o 10:45 ora solare) e scrivi il motivo nell'ultimo messaggio della sessione.
- Limiti di tempo: al massimo circa 15 ricerche web in tutto. Preferisci siti ufficiali dei club, agenzie (ANSA, Reuters) e quotidiani sportivi importanti. Per ogni notizia segna la fonte e l'ora della notizia.

## Passi, in ordine

1. Node: se esiste la cartella `/opt/node24/bin`, esegui `export PATH=/opt/node24/bin:$PATH`. Poi `node --version` (serve la 24).
2. Aggiorna il repository: `git checkout main && git pull`.
3. Controlla che esista `data/raccolta/<oggi>.json` (la data di Roma si ottiene con `TZ=Europe/Rome date +%F`). Se il file **non esiste**, scrivi il motivo da riportare nell'ultimo messaggio e vai al passo 6: il giro scrive una giornata vuota con l'errore.
   Poi esegui `npm run giro -- --anteprima`. Stampa una riga per ogni partita in gara:
   `idPartita · partita · inizio · mercati in gara`
   dove ogni mercato in gara compare come `idCandidato: mercato | selezione`, separati da virgole (per esempio `calcio-2026-10-20-inter-roma-1x2-1: 1X2 | 1`). L'`idCandidato` si copia così com'è in `esclusioni`.
   Se il file esiste ma non ha partite, o l'anteprima non elenca nulla, **non fermarti**: scrivi comunque il file notizie del passo 5 con `partiteControllate: []`, `esclusioni: []`, `correzioni: []` ed esegui `npm run giro`. Ci si ferma e si lascia la mano alla riserva solo quando il file della raccolta manca davvero.
4. Ricerca web, **solo** per le partite elencate dall'anteprima. Per ognuna cerca: assenze e dubbi sui titolari chiave, squalifiche, cambio di allenatore recente, meteo estremo, motivazioni anomale (per esempio una squadra già salva o già retrocessa). Segna per ogni fatto la fonte e l'ora.
   Per scrivere correzioni ed esclusioni apri `data/raccolta/<oggi>.json`: in `partite[].mercati[]` trovi i nomi esatti di `mercato` e `selezione`, da copiare identici. Lì ci sono anche i mercati sotto soglia, che si possono correggere come gli altri.
5. Scrivi `data/raccolta/<oggi>-notizie.json` (formato sotto). `<oggi>` è la data di Roma di oggi, `AAAA-MM-GG` (`TZ=Europe/Rome date +%F`). Scrivi una correzione o un'esclusione **solo** per un fatto concreto con fonte e ora. L'ora della notizia va dentro `fonte` (per esempio "ANSA, 08:10"): non esiste un campo a parte.
6. Esegui `git pull` e subito dopo `npm run giro` (così il giro vede anche le segnature arrivate nel frattempo). Applica correzioni ed esclusioni, ricalcola le probabilità e scrive `data/giornate/<oggi>.json`. Se fallisce con un messaggio sulle correzioni non valide, il messaggio dice quale voce e perché: sistema il file notizie e riprova. Se il motivo è un altro, vedi le regole sopra.
7. Esegui `npm test`. Se fallisce, non pubblicare: vedi le regole sopra.
8. Salva e pubblica: `git add data/ && git commit -m "Giro del mattino <data>" && git push origin main`.
   Se il push viene rifiutato: `git pull --rebase` e di nuovo `git push origin main`. Se il `git pull --rebase` dà un conflitto: `git rebase --abort`, fermati e spiega il motivo nell'ultimo messaggio (la riserva penserà al resto). Al massimo 3 tentativi in tutto. Se il push è rifiutato per mancanza di permessi, fermati: vedi il Piano B qui sotto.
9. Nell'ultimo messaggio riassumi: quante partite hai controllato, quante correzioni ed esclusioni hai scritto e perché, eventuali problemi.

## Formato di `data/raccolta/<oggi>-notizie.json`

```json
{
  "controllateAlle": "2026-10-20T08:15:00+02:00",
  "partiteControllate": ["calcio-2026-10-20-inter-roma"],
  "esclusioni": [
    { "idPartita": "calcio-2026-10-20-inter-roma", "idCandidato": "calcio-2026-10-20-inter-roma-1x2-1", "motivo": "allenatore squalificato e panchina incerta", "fonte": "ANSA, 08:10" }
  ],
  "correzioni": [
    { "idPartita": "calcio-2026-10-20-inter-roma", "mercato": "Under/Over 2.5", "selezione": "Over 2.5", "delta": -0.05, "motivo": "assente l'attaccante titolare", "fonte": "sito ufficiale del club, 08:05" }
  ]
}
```

- `controllateAlle`: orario ISO di quando hai finito il controllo, con fuso (obbligatorio).
- `partiteControllate`: gli `idPartita` che hai davvero controllato. Compilalo **sempre**, anche se non hai trovato niente e `esclusioni` e `correzioni` sono vuote.
- `esclusioni`: ogni voce ha `idPartita`, `motivo` e `fonte` (obbligatori). Senza `idCandidato` si esclude l'intera partita; con `idCandidato` si esclude solo quel candidato. Si può escludere qualunque mercato e qualunque partita, anche quelle senza correzione possibile.
- `correzioni`: ogni voce ha `idPartita`, `mercato`, `selezione`, `delta`, `motivo`, `fonte` (tutti obbligatori). `mercato` e `selezione` devono essere scritti esattamente come nella raccolta di oggi.
- `idCandidato` lo costruisce il codice: `<idPartita>-<mercato>-<selezione>`, con mercato e selezione scritti in minuscolo, senza accenti, con i simboli sostituiti da trattini (e "+"/"-" davanti a una cifra resi come "piu"/"meno"). Esempi: `calcio-2026-10-20-inter-roma-1x2-1` e `calcio-2026-10-20-inter-roma-under-over-2-5-over-2-5`. Per escludere un'intera partita basta `idPartita`, senza `idCandidato`.
- `delta` è in **punti di probabilità**, come numero decimale con il punto: `-0.05` significa meno 5 punti percentuali, `0.03` più 3.

## Regole delle correzioni (§6.1 dello spec, per intero)

- **Su cosa si applica**: sulla probabilità **del modello**, prima della media con Pinnacle. Pinnacle alle 07:35 ha spesso già incorporato le notizie note: correggere la media intera conterebbe la notizia due volte. Con Pinnacle presente l'effetto sulla probabilità finale è quindi la metà della correzione; senza Pinnacle è intero.
- **Tetto**: al massimo **±8 punti percentuali** (`delta` da -0,08 a +0,08, scritto nel file come `-0.08` e `0.08`) sulla probabilità del modello per ogni mercato, e la probabilità corretta deve restare tra 0,02 e 0,98.
- **Coerenza**: una correzione su una selezione vale anche per le altre selezioni dello stesso mercato. Per esempio over 2,5 −5 punti implica under 2,5 +5 punti: lo applica lo script, non tu.
  - Mercati con due selezioni (Under/Over, Gol/No gol): una sola correzione per mercato; la selezione opposta riceve la correzione contraria in automatico.
  - 1X2: puoi correggere una oppure due selezioni (mai tre), e la terza si ricava, così il totale resta 100%. Con una sola correzione le altre due si dividono la correzione contraria in proporzione alla loro probabilità del modello. Anche la correzione ricavata non può superare 0,08.
  - La stessa selezione non si corregge due volte.
- **Controllo col mercato**: lo scarto oltre 10 punti da Pinnacle (§5.2) si calcola **dopo** la correzione. Una correzione esagerata fa scartare la giocata invece di gonfiarne il value.
- **Cosa non si può fare**: inventare mercati o partite che il modello non ha calcolato. Correggere senza un fatto concreto, cioè senza fonte e ora. Si può invece far entrare un mercato che era sotto soglia.
- **Partite "solo Pinnacle"** (coppe e nazionali, senza modello): non si possono correggere, solo escludere.
- **Giro di riserva**: nessuna correzione, perché le notizie non sono controllate.
- La scheda mostrerà una riga tipo "Notizie: assente Lautaro (fonte, 08:15) → over 2,5: modello da 58% a 53%, finale 55%".

### Quali mercati si possono correggere

| Mercato | Selezioni | Correggibile |
|---|---|---|
| `1X2` | `1`, `X`, `2` | sì |
| `Under/Over 1.5`, `2.5`, `3.5` | `Over 2.5`, `Under 2.5`… | sì |
| `Under/Over casa …` e `Under/Over trasferta …` (0.5, 1.5, 2.5) | `Over 1.5`… | sì |
| `Under/Over 1° tempo 0.5`, `1.5` | `Over 0.5`… | sì |
| `Gol/No gol` | `Gol`, `No gol` | sì |
| `Angoli Under/Over 8.5` … `11.5` | `Over 9.5`… | sì |
| `Cartellini Under/Over 3.5`, `4.5`, `5.5` | `Over 4.5`… | sì |
| `Doppia chance` | `1X`, `12`, `X2` | no, solo esclusione |
| `Risultato esatto` | `2-1`… | no, solo esclusione |
| `Handicap asiatico …` | `casa`, `trasferta` | no, solo esclusione |

I mercati non correggibili si possono soltanto escludere (con `esclusioni`).

## Piano B: il push su `main` viene rifiutato per permessi (non ancora attivo)

Il Piano B (spingere solo il file notizie su un ramo dedicato e far girare il giro da una GitHub Action) **non è ancora attivo**: nessuna Action legge quel ramo. Per ora, se il push su `main` è rifiutato perché non hai i permessi (non per un semplice conflitto, che si risolve con `git pull --rebase`):

- fermati, senza spingere niente su altri rami;
- lascia che parta il giro di riserva (09:45 UTC), che scrive la giornata senza le notizie;
- nell'ultimo messaggio spiega che il push è stato rifiutato, con il messaggio di errore, e quali correzioni ed esclusioni avevi trovato.
