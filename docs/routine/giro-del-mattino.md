# Giro del mattino: istruzioni per Claude

Sei la routine "Giro del mattino" del progetto Analisi giocate (calcio, NBA, tennis, basket e pallavolo). Ogni mattina, alle 07:07 UTC (08:07 ora solare, 09:07 ora legale), controlli le notizie sulle partite di oggi, scrivi un file di correzioni ed esclusioni e fai girare lo script che costruisce le giocate del giorno. I calcoli li fa lo script: tu porti solo fatti concreti, con fonte e ora.

Tutto quello che scrivi in file o messaggi è in italiano.

## Regole che valgono sempre

- Lavora su `main`. Non usare altri rami (il "Piano B" in fondo non è ancora attivo).
- Non modificare codice, test, configurazione o workflow. Non toccare file di giorni diversi da oggi.
- Non inventare dati, partite, mercati, fonti o orari. Se non trovi un fatto concreto, non scrivere nulla per quella partita.
- Se un passo fallisce e non riesci a sistemarlo nei modi indicati, fermati: non inventare niente. Lascia che lo faccia il giro di riserva (parte alle 09:45 UTC, cioè 11:45 ora legale o 10:45 ora solare) e scrivi il motivo nell'ultimo messaggio della sessione.
- Limiti di tempo: al massimo 20 ricerche web in tutto (`ricercheMassime`), calcio, NBA, tennis, basket e pallavolo insieme. Preferisci siti ufficiali dei club, agenzie (ANSA, Reuters) e quotidiani sportivi importanti. Per ogni notizia segna la fonte e l'ora della notizia.

## Passi, in ordine

1. Node: se esiste la cartella `/opt/node24/bin`, esegui `export PATH=/opt/node24/bin:$PATH`. Poi `node --version` (serve la 24).
2. Aggiorna il repository: `git checkout main && git pull`.
3. Controlla quali file di raccolta esistono oggi (la data di Roma si ottiene con `TZ=Europe/Rome date +%F`): `data/raccolta/<oggi>.json` (calcio), `data/raccolta/<oggi>-nba.json` (NBA), `data/raccolta/<oggi>-tennis.json` (tennis) `data/raccolta/<oggi>-basket.json` (basket: Eurolega e NBL) e `data/raccolta/<oggi>-pallavolo.json` (pallavolo). Se **non esiste nessuno dei cinque**, scrivi il motivo da riportare nell'ultimo messaggio e vai al passo 6: il giro scrive una giornata vuota con l'errore.
   Il file `data/raccolta/<oggi>-odss.json` (quote dei bookmaker italiani da odss-api, scaricate dalla raccolta su GitHub) non è un file di raccolta da controllare: lo legge da solo `npm run giro` per le quote dei pronostici. Non aprirlo e non modificarlo; se manca, il giro lo scrive in `erroriGiro` e va avanti.
   Le quote delle raccolte vengono da odss-api per tutti gli sport (`fonteQuota` "mediana di N bookmaker (odss-api)"); se odss non rispondeva, o non aveva una competizione, vengono dalla fonte di prima (The Odds API, SportsGameOdds, OddsPapi) e in `erroriGiro` c'è la riga che lo dice. Non è un errore da correggere: le giocate si valutano come sempre. Le coppe e i campionati extra del calcio ora possono avere la quota.
   Se esiste almeno uno dei cinque, esegui `npm run giro -- --anteprima`; il file notizie serve anche se esiste solo il file di uno degli altri sport (`<oggi>-nba.json`, `<oggi>-tennis.json`, `<oggi>-basket.json` o `<oggi>-pallavolo.json`). Stampa una riga per ogni partita in gara:
   `idPartita · partita · inizio · mercati in gara`
   dove ogni mercato in gara compare come `idCandidato: mercato | selezione`, separati da virgole (per esempio `calcio-2026-10-20-inter-roma-1x2-1: 1X2 | 1`). L'`idCandidato` si copia così com'è in `esclusioni`.
   Se il file esiste ma non ha partite, o l'anteprima non elenca nulla, **non fermarti**: scrivi comunque il file notizie del passo 5 con `partiteControllate: []`, `esclusioni: []`, `correzioni: []` ed esegui `npm run giro`. Ci si ferma e si lascia la mano alla riserva solo quando mancano davvero tutti i file di raccolta di oggi (né `<oggi>.json` né `<oggi>-nba.json` né `<oggi>-tennis.json` né `<oggi>-basket.json` né `<oggi>-pallavolo.json`).
4. Ricerca web, **solo** per le partite elencate dall'anteprima. Per ognuna cerca: assenze e dubbi sui titolari chiave, squalifiche, cambio di allenatore recente, meteo estremo, motivazioni anomale (per esempio una squadra già salva o già retrocessa). Segna per ogni fatto la fonte e l'ora.
   Per scrivere correzioni ed esclusioni apri `data/raccolta/<oggi>.json` per il calcio, `data/raccolta/<oggi>-nba.json` per l'NBA, `data/raccolta/<oggi>-tennis.json` per il tennis `data/raccolta/<oggi>-basket.json` per il basket e `data/raccolta/<oggi>-pallavolo.json` per la pallavolo: in `partite[].mercati[]` trovi i nomi esatti di `mercato` e `selezione`, da copiare identici. Lì ci sono anche i mercati sotto soglia, che si possono correggere come gli altri.
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
- `giocatoriChiave` (facoltativo, consigliato): per le partite di **calcio e NBA** dell'anteprima, i 2-4 titolari per squadra da cui dipende di più la partita (per esempio il centravanti, il portiere, la stella NBA), con **nome e cognome interi come li scrive ESPN** (per esempio "Lautaro Martínez", non "Lauti Martínez" né "L. Martínez"; "Enrique García", non "Kike García"): niente soprannomi né iniziali. Con un soprannome, o con due giocatori della stessa squadra con lo stesso cognome, il controllo non riesce a riconoscere il giocatore e la giocata resta in revisione. Servono al controllo prima della partita: se uno di loro non è nella formazione ufficiale (calcio) o è "Out" nel report infortuni (NBA), la giocata va in revisione. Formato: `"giocatoriChiave": { "calcio-2026-10-20-inter-roma": { "casa": ["Lautaro Martínez", "Nicolò Barella"], "trasferta": ["Paulo Dybala"] } }`. Metti solo giocatori che dovrebbero essere titolari: chi è già assente non va messo.
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
| `Vincente` (NBA) | nome completo della squadra | sì |
| `Vincente incontro` (tennis) | nome completo del giocatore | sì |
| `Handicap <linea>` (NBA): `Handicap -4.5`, `Handicap +3`, `Handicap 0` | `casa`, `trasferta` | sì |
| `Totale punti <linea>` (NBA): `Totale punti 221.5` | `Over 221.5`, `Under 221.5` | sì |
| `Vincente`, `Handicap <linea>`, `Totale punti <linea>` (basket) | come l'NBA | sì, ma non nelle partite "solo mercato" |
| `Vincente`, `Handicap set -1.5`, `Handicap set +1.5`, `Totale set 3.5` (pallavolo) | squadra, `casa`/`trasferta`, `Over 3.5`/`Under 3.5` | sì, ma non nelle partite "solo mercato" |
| `Doppia chance` | `1X`, `12`, `X2` | no, solo esclusione |
| `Risultato esatto` | `2-1`… | no, solo esclusione |
| `Handicap asiatico …` | `casa`, `trasferta` | no, solo esclusione |

I mercati non correggibili si possono soltanto escludere (con `esclusioni`).

## NBA

Le partite NBA di oggi sono in `data/raccolta/<oggi>-nba.json` e compaiono nell'anteprima insieme a quelle di calcio. Usano lo stesso file notizie, le stesse correzioni ed esclusioni e le stesse regole (tetto ±0,08, selezione opposta automatica). Il tetto di ricerche web vale per tutto il giro: 20 in totale, non per sport.

- **Che cosa cercare**: leggi il report infortuni ufficiale NBA più recente e le notizie delle squadre (titolari fuori, riposi, rientri).
- **"Out" (fuori) di un titolare**: è un fatto. Scrivi una correzione (`delta`) oppure un'esclusione, con fonte e ora dentro `fonte`.
- **"Questionable" (in dubbio)**: non è un fatto. Nessuna correzione e nessuna esclusione, e non va scritto nel file notizie (non ha un campo per questo: non inventarne e non usare correzioni con `delta` 0). Elenca i giocatori "questionable" nell'ultimo messaggio della sessione, con fonte e ora (per esempio "Tatum questionable, report infortuni NBA, 08:20").
- **Nomi esatti dei mercati NBA** (da copiare identici da `partite[].mercati[]`; tutti e tre contano i supplementari):
  - `Vincente`, con selezione il nome completo della squadra (per esempio `Boston Celtics`);
  - `Handicap <linea>`, con la linea riferita alla squadra di casa e scritta con il segno (`Handicap -4.5`, `Handicap +3`, `Handicap 0`) e selezione `casa` o `trasferta`;
  - `Totale punti <linea>` (per esempio `Totale punti 221.5`), con selezione `Over 221.5` o `Under 221.5`.

  Sono tutti correggibili. `Vincente` ha due selezioni e si tratta come un mercato Under/Over: una sola correzione per mercato, l'altra squadra riceve quella contraria.
- **Formato degli id NBA**: `idPartita` = `nba-<data>-<casa>-<trasferta>`, con la data della giornata (08:00-08:00 di Roma) e i nomi completi delle squadre in minuscolo e con i trattini. `idCandidato` = `<idPartita>-<mercato>-<selezione>` con le stesse regole del calcio. Esempi per `nba-2026-10-20-boston-celtics-new-york-knicks`:
  - `nba-2026-10-20-boston-celtics-new-york-knicks-vincente-boston-celtics`
  - `nba-2026-10-20-boston-celtics-new-york-knicks-handicap-meno-4-5-casa`
  - `nba-2026-10-20-boston-celtics-new-york-knicks-handicap-piu-3-trasferta`
  - `nba-2026-10-20-boston-celtics-new-york-knicks-totale-punti-221-5-over-221-5`
- Le partite NBA che hai davvero controllato vanno anche in `partiteControllate`.
- Di sera la routine "Giro serale" ricontrolla le giocate NBA già decise e aggiunge le partite di tennis notturne: vedi `docs/routine/giro-serale.md`.

## Tennis

Le partite di tennis di oggi sono in `data/raccolta/<oggi>-tennis.json` e compaiono nell'anteprima insieme a quelle di calcio e NBA. Usano lo stesso file notizie, le stesse correzioni ed esclusioni e le stesse regole (tetto ±0,08, selezione opposta automatica). Il tetto di 20 ricerche web vale per tutto il giro, non per sport.

- **Che cosa cercare**, per ogni partita elencata dall'anteprima: ritiri o forfait annunciati, infortuni o malessere dichiarati, partite molto lunghe giocate il giorno prima (per esempio oltre le tre ore o cinque set). Preferisci i siti ufficiali dei tornei e di ATP e WTA, le agenzie e i quotidiani sportivi importanti.
- **Ritiro annunciato** (un giocatore si è ritirato dal torneo o ha dato forfait): è un'**esclusione** della partita, con `idPartita` e senza `idCandidato`.
- **Infortunio o malessere noto**, oppure **partita molto lunga il giorno prima**: è una **correzione** di al massimo ±0,08 su `Vincente incontro`, negativa per il giocatore penalizzato. Una sola correzione per partita: l'altro giocatore riceve in automatico quella contraria.
- **Dubbio senza fatto** (per esempio "sembrava stanco"): non è un fatto. Nessuna correzione e nessuna esclusione.
- **Mercato**: il tennis ha un solo mercato, `Vincente incontro`, con selezione il nome completo del giocatore come lo scrive The Odds API. I nomi esatti si copiano da `partite[].mercati[]` di `data/raccolta/<oggi>-tennis.json`. È correggibile.
- **Formato degli id tennis**: `idPartita` = `tennis-<data>-<giocatore1>-<giocatore2>`, con i due nomi in ordine alfabetico (nel tennis non c'è casa o trasferta), in minuscolo e con i trattini. `partita` mostra invece i nomi nell'ordine della quota ("Giocatore1 - Giocatore2"). `idCandidato` = `<idPartita>-<mercato>-<selezione>` con le stesse regole del calcio. Esempio per `tennis-2026-10-20-carlos-alcaraz-jannik-sinner`:
  - `tennis-2026-10-20-carlos-alcaraz-jannik-sinner-vincente-incontro-jannik-sinner`
- Le partite tennis che hai davvero controllato vanno anche in `partiteControllate`.
- Esempio di correzione: `{ "idPartita": "tennis-2026-10-20-carlos-alcaraz-jannik-sinner", "mercato": "Vincente incontro", "selezione": "Jannik Sinner", "delta": -0.05, "motivo": "ha giocato cinque set il giorno prima", "fonte": "sito ufficiale del torneo, 08:05" }`.
- Di sera la routine "Giro serale" aggiunge le partite che iniziano di notte o all'alba: vedi `docs/routine/giro-serale.md`.

## Basket (Eurolega e NBL)

Le partite di Eurolega e di NBL australiana di oggi sono in `data/raccolta/<oggi>-basket.json` e compaiono nell'anteprima insieme agli altri sport. Usano lo stesso file notizie e le stesse regole dell'NBA (tetto ±0,08, selezione opposta automatica). Il tetto di 20 ricerche web vale per tutto il giro, non per sport.

- **Che cosa cercare**: assenze confermate dei titolari (infortuni, squalifiche), dai siti ufficiali delle squadre, dell'Eurolega (euroleaguebasketball.net) e dell'NBL (nbl.com.au), o dai quotidiani sportivi importanti.
- **Assenza confermata di un titolare**: è un fatto. Scrivi una correzione (`delta`) oppure un'esclusione, con fonte e ora dentro `fonte`.
- **"In dubbio"**: non è un fatto. Nessuna correzione e nessuna esclusione; elencalo nell'ultimo messaggio della sessione, con fonte e ora.
- **Mercati**: gli stessi nomi dell'NBA, da copiare identici da `partite[].mercati[]`: `Vincente` (selezione il nome della squadra come lo scrive The Odds API, per esempio `Real Madrid`), `Handicap <linea>` (selezione `casa` o `trasferta`) e `Totale punti <linea>`. Supplementari compresi.
- **Partite "solo mercato"** (`"modello": "solo-pinnacle"`, cioè senza storico sufficiente): non si possono correggere, solo escludere.
- **Formato degli id basket**: `idPartita` = `basket-<data>-<casa>-<trasferta>`, con i nomi delle squadre come li scrive The Odds API, in minuscolo e con i trattini. Esempio: `basket-2026-10-21-real-madrid-fc-barcelona` e il candidato `basket-2026-10-21-real-madrid-fc-barcelona-vincente-real-madrid`.
- Le partite basket che hai davvero controllato vanno anche in `partiteControllate`.
- Le partite NBL che iniziano di notte o all'alba (prima delle 08:00 del giorno dopo) sono già nella raccolta del mattino: controllale insieme alle altre.

## Pallavolo

Le partite di pallavolo di oggi sono in `data/raccolta/<oggi>-pallavolo.json` (SuperLega, PlusLiga, Efeler Ligi turca, Bundesliga) e compaiono nell'anteprima insieme agli altri sport. Usano lo stesso file notizie e le stesse regole (tetto ±0,08, selezione opposta automatica). Il tetto di 20 ricerche web vale per tutto il giro.

- **Che cosa cercare**: assenze confermate di un titolare chiave (opposto, schiacciatore principale, palleggiatore) e turnover annunciato, dai siti ufficiali dei club e delle leghe (legavolley.it, plusliga.pl) o dai quotidiani sportivi importanti.
- **Assenza confermata di un titolare chiave**: correzione (`delta`) oppure esclusione, con fonte e ora dentro `fonte`. **Turnover annunciato**: correzione.
- **"In dubbio"**: nessuna correzione; elencalo nell'ultimo messaggio della sessione, con fonte e ora.
- **Mercati**, da copiare identici da `partite[].mercati[]`: `Vincente` (selezione il nome della squadra come lo scrive odss-api, o OddsPapi nei giorni di riserva), `Handicap set -1.5` e `Handicap set +1.5` (riferiti alla squadra di casa, selezione `casa` o `trasferta`), `Totale set 3.5` (`Over 3.5` = si gioca il quarto set; `Under 3.5` = finisce 3-0 o 0-3). Con le quote di odss-api l'handicap set c'è solo se odss lo dà con esiti chiari: spesso mancano e restano vincente e totale set.
- **Partite "solo mercato"** (`"modello": "solo-pinnacle"`): non si possono correggere, solo escludere.
- **Formato degli id**: `idPartita` = `pallavolo-<data>-<casa>-<trasferta>`, con i nomi della fonte delle quote (odss-api, o OddsPapi) in minuscolo e con i trattini. Esempio: `pallavolo-2026-10-21-itas-trentino-rana-verona` e il candidato `pallavolo-2026-10-21-itas-trentino-rana-verona-handicap-set-meno-1-5-casa`.
- Le partite di pallavolo che hai davvero controllato vanno anche in `partiteControllate`.

## Piano B: il push su `main` viene rifiutato per permessi (non ancora attivo)

Il Piano B (spingere solo il file notizie su un ramo dedicato e far girare il giro da una GitHub Action) **non è ancora attivo**: nessuna Action legge quel ramo. Per ora, se il push su `main` è rifiutato perché non hai i permessi (non per un semplice conflitto, che si risolve con `git pull --rebase`):

- fermati, senza spingere niente su altri rami;
- lascia che parta il giro di riserva (09:45 UTC), che scrive la giornata senza le notizie;
- nell'ultimo messaggio spiega che il push è stato rifiutato, con il messaggio di errore, e quali correzioni ed esclusioni avevi trovato.
