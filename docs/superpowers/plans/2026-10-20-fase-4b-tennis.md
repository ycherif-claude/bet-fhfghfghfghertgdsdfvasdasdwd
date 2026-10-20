# Fase 4b – Tennis: dati, modello, giro del mattino e giro della sera prima – Piano di sviluppo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere il tennis, solo il mercato "Vincente incontro", alla giornata:
- raccolta del mattino: tennis-data.co.uk per lo storico (xlsx), The Odds API per palinsesto e quote `h2h`;
- modello Elo per superficie;
- esiti delle giocate;
- giro della sera prima, che aggiunge le partite notturne nella stessa esecuzione serale dell'NBA.

Il calcio e l'NBA non devono cambiare comportamento.

**Architecture:** Il codice sta in `src/tennis/`, con la stessa forma di `src/nba/`. La raccolta scrive `data/raccolta/<data>-tennis.json` e il giro la legge come gli altri sport (`SPORT_RACCOLTA`). Per la sera, il workflow serale (oggi solo NBA) diventa `serale.yml`. Avvia la routine se servono il controllo NBA o l'aggiunta tennis. Prima di avviarla prepara `data/raccolta/<data>-serale-tennis.json`. Lo script `serale-tennis` aggiunge le nuove giocate alla giornata senza toccare quelle esistenti.

**Tech Stack:** Node.js 24 (moduli ES, `node:test`, `fetch`, `zlib` nativo, nessun pacchetto npm), GitHub Actions, routine Claude.

**Spec:** `docs/superpowers/specs/2026-10-20-fase-4b-tennis-design.md` (approvato). Valgono anche gli spec della Fase 2 e della Fase 4a.

## Global Constraints

- Calcio e NBA invariati: tutti i 390 test esistenti restano verdi senza cambiare le asserzioni. Il test snapshot del calcio in `test/giro` non va toccato.
- Non si modificano `src/regole/`, `src/bankroll/` e `src/storico/`.
- `sport` = `"tennis"`. `competizione` = nome italiano del torneo, per esempio "ATP Masters 1000 Parigi" oppure, se la categoria non si ricava, il titolo di The Odds API.
- Mercato: `Vincente incontro`, con selezione il nome completo del giocatore come lo scrive The Odds API. È correggibile, e la complementare si ricava in automatico.
- `idPartita` = `tennis-${data}-${slug(giocatore1)}-${slug(giocatore2)}`. I nomi vanno in ordine alfabetico, perché nel tennis non c'è casa o trasferta. `partita` = "Giocatore1 - Giocatore2", nell'ordine di The Odds API (home e away).
- `CONFIG.tennis` in `src/config.js`, con questi valori:

  | Chiave | Valore |
  |---|---|
  | `eloIniziale` | `1500` |
  | `kBase` | `250` |
  | `kOffset` | `5` |
  | `kEsponente` | `0.4` |
  | `pesoSuperficie` | `0.5` |
  | `pesoModello` | `0.5` |
  | `pesoModelloPocheDati` | `0.25` |
  | `minPartite12Mesi` | `20` |
  | `minBookmaker` | `3` |
  | `creditiPerTorneo` | `1` |
  | `riservaSeraPerTorneo` | `1` |

- Superfici: `cemento`, `terra`, `erba`. "Carpet" e i valori sconosciuti contano come `cemento`.
- Best of 5 solo per l'ATP negli Slam: chiavi che contengono `aus_open`, `french_open`, `wimbledon` o `us_open`.
- Ritiri: con almeno un set completato vince chi passa il turno; prima della fine del primo set, o con walkover, la giocata è `rimborsata`.
- Crediti di The Odds API: budget giornaliero unico, calcolato con `budgetCrediti` della Fase 2 sui crediti di inizio giornata. Il calcio spende per primo. Il tennis spende quello che resta, tenendo da parte `riservaSeraPerTorneo` per ogni torneo attivo, e non va mai sotto la riserva del 20%.
- Nessun errore silenzioso, in formato `"<fonte> alle HH:MM: <messaggio>"`. Se il tennis fallisce, calcio e NBA vanno avanti.
- Nessun pacchetto npm. Il formato xlsx si legge con `zlib.inflateRawSync` e un parser XML minimo.

## Review Focus

1. **Nomi in formati diversi:** "Sinner J." (tennis-data) e "Jannik Sinner" (The Odds API); cognomi composti ("Auger-Aliassime F.", "De Minaur A.", "Bautista Agut R."); omonimie (due "Zverev"). L'abbinamento vale solo se è unico. → test nel Task 1.
2. **Partita notturna di Pechino alle 05:00 di Roma del 21/10:** appartiene alla giornata del 20/10. Il giro della sera del 20/10 la aggiunge, il giro del mattino del 21/10 non la ripete come giornata del 21 e la raccolta del 21/10 non la rimette. → test nei Task 4 e 6.
3. **Aggiunta serale con giocate già segnate:** le giocate esistenti restano identiche, byte per byte. Le nuove rispettano i limiti: le puntate proposte e non segnate contano nel tetto e nello stop, e le nuove singole non superano 10 − quelle già proposte. → test nel Task 6.
4. **Crediti quasi finiti:** il calcio ha la precedenza, il tennis scopre i tornei con un messaggio in `competizioniNonCoperte`, e la riserva non si tocca mai. → test nel Task 4.
5. **Ritiro dopo 1 set o prima; walkover:** l'esito è giusto in ogni caso. → test nel Task 4.

---

## Struttura dei file

```
src/config.js                     + CONFIG.tennis
src/tennis/xlsx.js                lettore xlsx minimo (zip + XML) → righe come oggetti
src/tennis/giocatori.js           normalizzazione nomi, abbinamento "Sinner J." ↔ "Jannik Sinner", ALIAS
src/tennis/fonti/tennis-data.js   elenco file stagione (alldata.php), download, righe → PartitaTennis
src/tennis/fonti/odds-tennis.js   tornei attivi (/v4/sports), eventi, quote h2h (solo h2h, 1 credito)
src/tennis/elo.js                 Elo complessivo e per superficie, probabilità, best of 5
src/tennis/raccolta.js            raccolta del mattino + esiti + CLI → <data>-tennis.json
src/tennis/esiti.js               esito delle giocate tennis
src/tennis/serale.js              finestra notturna, raccolta serale, aggiunta delle giocate + CLI
src/giro/raccolte.js, notizie.js  + 'tennis' (Task 5)
src/nba/serale.js                 daAvviare esteso alle partite tennis notturne (Task 7)
.github/workflows/raccolta.yml    + passo tennis
.github/workflows/serale.yml      (rinomina di serale-nba.yml, Task 7)
docs/routine/*.md, README.md      (Task 8)
```

## Formato di `data/raccolta/<data>-tennis.json` e `<data>-serale-tennis.json`

È il formato della raccolta calcio, con queste differenze:
- per ogni partita: `sport: "tennis"`, `modello: "elo"`, `lambda: null`, più `elo: { [nome]: { tot, superficie } }`, `superficie`, `bestOf` e `pesoModello`;
- un mercato `Vincente incontro` per ciascun giocatore, con `probModello`, `probPinnacle` (Pinnacle senza margine, oppure null), `quota` (mediana, regione `eu`), `fonteQuota: "mediana di N bookmaker (The Odds API)"`, `oraQuota`, `frequenzaCampionato: null` e `spiegazione`;
- `crediti: { usati, rimasti }`.

---

### Task 1: Configurazione, lettore xlsx e nomi dei giocatori

**Files:** Modify `src/config.js`. Create `src/tennis/xlsx.js`, `src/tennis/giocatori.js`. Tests: `test/tennis/xlsx.test.js`, `test/tennis/giocatori.test.js`, `test/fixtures/tennis/mini.xlsx` (piccolo file vero da 2-3 righe, generato nel test o salvato: va bene un xlsx minimo costruito a mano con zip "stored" e uno compresso "deflate").

**Interfaces:**
- `leggiXlsx(buffer): object[]`: legge il primo foglio; la prima riga è l'intestazione.
  - Celle stringa (`t="s"`, stringhe condivise), `inlineStr`, numeri, celle vuote.
  - Le date (numero seriale Excel) si convertono in `AAAA-MM-GG` per le colonne il cui nome contiene `Date`.
  - Supporta zip "stored" e "deflate" e legge la directory centrale per trovare i file.
  - Un file non valido lancia `Error("xlsx non valido: <motivo>")`.
- `normalizzaGiocatore(nome): { cognome: string, iniziale: string|null }`:
  - minuscole e senza accenti;
  - trattini e apostrofi diventano spazio;
  - formato "Cognome N." oppure "Nome Cognome": in "Nome Cognome" il cognome è tutto tranne la prima parola.
- `abbinaGiocatore(nomeOdds, nomiTennisData: string[]): string|null`:
  - `ALIAS` esatto, prima di tutto;
  - poi un unico candidato con lo stesso cognome normalizzato e la stessa iniziale;
  - altrimenti null.
- `ALIAS: Record<string, string>`: all'inizio è vuoto, con un commento che dice di riempirlo al collaudo.

- [ ] **Step 1: Test che falliscono**

```js
test('xlsx stored e deflate: intestazione, stringhe condivise, numeri, date', () => { /* … */ });
test('xlsx non valido → errore chiaro', () => assert.throws(() => leggiXlsx(Buffer.from('ciao')), /xlsx non valido/));
test('Jannik Sinner ↔ Sinner J.', () => assert.equal(abbinaGiocatore('Jannik Sinner', ['Sinner J.', 'Rune H.']), 'Sinner J.'));
test('cognomi composti: Felix Auger-Aliassime ↔ Auger-Aliassime F.; Alex de Minaur ↔ De Minaur A.; Roberto Bautista Agut ↔ Bautista Agut R.', () => { /* … */ });
test('omonimia: Alexander Zverev con Zverev A. e Zverev M. → Zverev A.; con due Zverev A. → null', () => { /* … */ });
test('nessun candidato → null', () => { /* … */ });
test('CONFIG.tennis congelato', () => { /* … */ });
```

- [ ] **Step 2–4:** RED → implementa → `npm test` PASS.
- [ ] **Step 5: Commit** `feat(tennis): configurazione, lettore xlsx e nomi`.

### Task 2: Fonti tennis

**Files:** Create `src/tennis/fonti/tennis-data.js`, `src/tennis/fonti/odds-tennis.js`. Tests: `test/tennis/fonti.test.js` e fixture.

**Interfaces:**
- `tennisData.fileStagione(anno, circuito: 'atp'|'wta', opz): Promise<string>`:
  - legge `http://www.tennis-data.co.uk/alldata.php` e ne estrae l'URL di `…/<anno>/<anno>.xlsx` (ATP) o `…/<anno>w/<anno>.xlsx` (WTA);
  - l'URL può contenere una cartella con un nome strano, per esempio `hrjk-…/2026/2026.xlsx`: va preso dalla pagina, non scritto a mano.
- `tennisData.partite(anno, circuito, opz): Promise<PartitaTennis[]>`, con `PartitaTennis = { data, torneo, serie, superficie: 'cemento'|'terra'|'erba', turno, bestOf, vincitore, perdente, setW: number[], setL: number[], commento: string|null, psw?: number, psl?: number }`.
  - I nomi delle colonne vanno presi dal file reale: `Date`, `Tournament`, `Series`/`Tier`, `Surface`, `Round`, `Best of`, `Winner`, `Loser`, `W1..W5`, `L1..L5`, `Comment`, `PSW`, `PSL`.
  - `User-Agent: analisi-giocate (progetto personale)`.
- `oddsTennis.torneiAttivi(opz): Promise<{ chiave, titolo, circuito }[]>`: chiama `/v4/sports` e tiene solo `tennis_atp_*` e `tennis_wta_*` con `active: true`.
- `oddsTennis.eventi(chiave, finestra, opz)` e `oddsTennis.quote(chiave, finestra, opz)`:
  - riusano `scarica` e lo schema di `src/calcio/fonti/odds-api.js`;
  - le quote chiedono `markets=h2h` e `regions=eu`, quindi 1 credito;
  - il risultato è `{ eventi: [{ id, giocatore1, giocatore2, inizio, bookmaker: [{ chiave, quote: { [nome]: decimale } }] }], rimasti, usati }`;
  - **non** si cambia `oddsApi.quote` del calcio.
- `oddsTennis.risultati(chiave, opz)`: `/scores` con `daysFrom=3`.

- [ ] **Step 1: Test che falliscono:**
  - URL da una fixture di `alldata.php` con la cartella strana;
  - righe convertite, con superficie Carpet → cemento e set;
  - `torneiAttivi` filtra quelli non attivi e quelli che non sono tennis;
  - `quote` chiede solo `h2h` (controllo sull'URL) e converte gli esiti per nome del giocatore;
  - errore 401 senza la chiave nel messaggio.
- [ ] **Step 2–4:** come sopra.
- [ ] **Step 5: Commit** `feat(tennis): fonti tennis-data e The Odds API`.

### Task 3: Modello Elo

**Files:** Create `src/tennis/elo.js`. Test: `test/tennis/elo.test.js`.

**Interfaces:**
- `calcolaElo(partite: PartitaTennis[]): Map<nome, { tot, cemento, terra, erba, partite: string[] /* date */ }>`:
  - partite in ordine di data;
  - K = `kBase/(n+kOffset)^kEsponente`, con n = partite già giocate da quel giocatore, contate separatamente per il complessivo e per ogni superficie;
  - le partite walkover (senza set giocati) non contano;
  - un ritiro conta come vittoria di chi passa il turno.
- `probElo(ra, rb) = 1/(1+10^((rb−ra)/400))`.
- `probVittoria(eloA, eloB, superficie, bestOf): number`:
  - p3 = media pesata (`pesoSuperficie`) di `probElo` sul complessivo e sulla superficie;
  - con bestOf 5: si trova la probabilità del singolo set s tale che `p3 = s²(3−2s)` (bisezione) e si restituisce `s³(10 − 15s + 6s²)`;
  - risultato in [1e-6, 1−1e-6].
- `pesoModelloPartita(elo, a, b, oggi)`: vale `pesoModelloPocheDati` se uno dei due giocatori ha meno di `minPartite12Mesi` partite negli ultimi 365 giorni, altrimenti `pesoModello`.

- [ ] **Step 1: Test che falliscono:**
  - stesso Elo → 0,5;
  - +200 punti → circa 0,76;
  - Elo aggiornato nella direzione giusta e K che cala con le partite;
  - superficie: un giocatore forte sulla terra ha p più alta sulla terra che sul cemento;
  - best of 5 dà al favorito più di best of 3 (p3 = 0,7 → p5 > 0,7), e con p3 = 0,5 resta 0,5;
  - walkover ignorato;
  - peso del modello con 19 o 20 partite.
- [ ] **Step 2–4:** come sopra.
- [ ] **Step 5: Commit** `feat(tennis): modello Elo per superficie`.

### Task 4: Raccolta ed esiti tennis

**Files:** Create `src/tennis/raccolta.js`, `src/tennis/esiti.js`. Modify `package.json` (`"raccolta-tennis"`) e `.github/workflows/raccolta.yml`, con un passo dopo l'NBA (`continue-on-error: true`, `ODDS_API_KEY` dai secrets). Tests: `test/tennis/raccolta.test.js`, `test/tennis/esiti.test.js`.

**Interfaces:**
- `eseguiRaccoltaTennis({ data, adesso, fonti, chiavi, dirData }): Promise<Raccolta>`, con questi passi:
  1. **Crediti:** legge `data/raccolta/<data>.json` del calcio, se esiste, per ricavare `rimastiInizio = calcio.crediti.rimasti + calcio.crediti.usati` e `spesiCalcio = calcio.crediti.usati`. Se il file manca, i rimasti si leggono dalla prima chiamata gratuita e il calcio vale 0. Poi `budget = budgetCrediti(rimastiInizio, data) − spesiCalcio − riservaSeraPerTorneo·tornei attivi`, senza scendere sotto 0.
  2. **Tornei:** prende quelli attivi con eventi nella finestra della giornata (08:00-08:00), per data d'inizio più vicina, finché `creditiPerTorneo·n ≤ budget`. Quelli scoperti vanno in `competizioniNonCoperte` come "<titolo>: crediti insufficienti".
  3. **Storico:** tennis-data dell'anno corrente e del precedente, per ATP e WTA.
  4. **Partite:** Elo e quote per ogni partita. `superficie` e `bestOf` vengono dalla riga tennis-data più recente dello stesso torneo; se mancano, si usa `cemento`/3 e un errore lo dice. Poi i mercati.
  5. **Errori:** i giocatori non abbinati vanno in `erroriGiro` come "Giocatori non riconosciuti: <nome Odds> (<torneo>)". La partita resta senza candidati.
  - **Spiegazione** del mercato: "Vincente incontro: vince se <nome> vince la partita. Se un giocatore si ritira dopo almeno un set completo vince chi passa il turno; se si ritira prima, o la partita non si gioca, la giocata è rimborsata".
- `esitoTennis(selezione, r: { vincitore, perdente, setW, setL, commento }): 'vinta'|'persa'|'rimborsata'|null`.
- `aggiornaEsitiTennis(dirData, risultati, adesso)`:
  - stesse garanzie degli altri sport: si scrive solo `esito`; esiti anche sulle annullate; avviso dopo 7 giorni secondo la regola già in uso; esito della gamba nelle multiple miste, come nella Fase 4a;
  - risultati da tennis-data, abbinati con `abbinaGiocatore` e la data di Roma ±1 giorno;
  - The Odds API `/scores` solo per i tornei con giocate senza esito da più di 1 giorno, se il budget residuo lo permette (2 crediti).
- CLI: senza `ODDS_API_KEY` scrive `partite: []` con l'errore ed esce con 0. Per qualsiasi eccezione inattesa fa lo stesso.

- [ ] **Step 1: Test che falliscono** (Review Focus 2, 4, 5):
  - partita alle 05:00 di Roma del 21/10 nella giornata del 20/10;
  - budget: calcio con 6 crediti spesi su un budget di 16 e 3 tornei attivi → il tennis ne usa al massimo 7 e copre fino a 7 tornei (qui 3);
  - crediti quasi finiti → tornei scoperti con il messaggio;
  - esiti: ritiro dopo un set → vince chi passa; ritiro prima → rimborsata; walkover → rimborsata;
  - nome non abbinato → errore, nessun candidato;
  - tennis-data giù → errore, e partite con il solo Pinnacle (`probModello` null).
- [ ] **Step 2–4:** come sopra.
- [ ] **Step 5: Commit** `feat(tennis): raccolta, esiti e workflow`.

### Task 5: Il giro legge il tennis

**Files:** Modify `src/giro/raccolte.js` (`SPORT_RACCOLTA = ['nba', 'tennis']`, messaggio "Raccolta tennis di oggi mancante: …") e `src/giro/notizie.js` (`Vincente incontro` correggibile). Tests: nuovi casi in `test/giro/*`.

**Interfaces:**
- Il giro unisce calcio, NBA e tennis in una sola `selezionaGiocate`.
- I candidati tennis hanno `sport: 'tennis'`, `pesoModello` per partita e la spiegazione in fondo.
- Gli snapshot del calcio restano identici. L'helper di test che oggi scrive un file NBA vuoto deve scrivere anche un file tennis vuoto, senza cambiare le asserzioni.

- [ ] **Step 1: Test che falliscono:**
  - calcio + NBA + tennis → una sola selezione con il tetto comune;
  - correzione su `Vincente incontro` con complementare automatica;
  - raccolta tennis mancante → errore e il resto invariato.
- [ ] **Step 2–4:** come sopra.
- [ ] **Step 5: Commit** `feat(giro): il tennis nel giro del mattino`.

### Task 6: Aggiunta serale tennis

**Files:** Create `src/tennis/serale.js`. Modify `package.json` (`"serale-tennis"`). Test: `test/tennis/serale.test.js`.

**Interfaces:**
- `finestraNotturna(data, orarioSerale: Date): { da: Date, a: Date }`, cioè da `orarioSerale` alle 08:00 di Roma del giorno dopo `data`.
- `raccoltaSeraleTennis({ data, adesso, orario, fonti, chiavi, dirData }) → data/raccolta/<data>-serale-tennis.json`:
  - solo le partite nella finestra notturna che non sono già fra i candidati della giornata (confronto per `idPartita`);
  - crediti: 1 per torneo con partite notturne, mai sotto la riserva;
  - lo storico tennis-data è lo stesso della mattina.
- `partiteNotturne(dirData, data): number`, cioè il numero di partite nel file serale. Serve al workflow.
- `aggiungiSeraleTennis({ dirData, adesso }): { aggiunte: number }`:
  - legge la giornata, il file serale e `<data>-serale-tennis-notizie.json`, che è obbligatorio quando ci sono partite e si valida con `validaNotizie` sulla raccolta serale;
  - con `costruisciCandidati` e `adesso` costruisce i nuovi candidati;
  - **stato corretto:**
    - parte da `statoBankroll` di tutte le giornate, compresa quella di oggi, perché le segnate di oggi contano;
    - `proposteAperte` = somma delle puntate delle giocate di oggi non annullate e senza segnatura;
    - `inGiocoOggi += proposteAperte`, `distanzaStop −= proposteAperte`;
  - chiama `selezionaGiocate`, poi toglie le multiple dal risultato (motivo "nessuna multipla nel giro serale") e tiene al massimo `10 − singole già proposte` singole per value (le altre: "limite giornaliero singole");
  - aggiunge in fondo a `giocate`, `candidati` e `scartate` della giornata. **Non** cambia niente di ciò che c'è già;
  - si rifiuta se una nuova partita è già iniziata o se gli `id` collidono, con un errore chiaro e senza scrivere;
  - rieseguirlo con gli stessi dati non aggiunge doppioni.
- CLI `node src/tennis/serale.js --raccolta | --conta | --aggiungi`.

- [ ] **Step 1: Test che falliscono** (Review Focus 2, 3):
  - giocate esistenti identiche byte per byte dopo l'aggiunta;
  - con una giocata già segnata, le nuove rispettano il tetto, che conta anche le proposte non segnate;
  - 9 singole già proposte → al massimo 1 nuova;
  - nessuna multipla nuova;
  - partita già presente fra i candidati → non ripetuta;
  - notizie mancanti con partite presenti → errore e nessuna scrittura;
  - seconda esecuzione → 0 aggiunte;
  - la build legge la giornata senza `erroriDati`.
- [ ] **Step 2–4:** come sopra.
- [ ] **Step 5: Commit** `feat(tennis): aggiunta serale delle partite notturne`.

### Task 7: Un solo workflow serale per NBA e tennis

**Files:** Rename `.github/workflows/serale-nba.yml` → `serale.yml` (nome "Giro serale"). Modify `src/nba/serale.js`, solo in `daAvviare` e `orarioSerale`, in modo compatibile. Tests: aggiornare i test statici del workflow (nome del file) senza cambiare ciò che verificano, più nuovi casi.

**Interfaces:**
- `orarioSerale` resta lo stesso per l'NBA. Se non ci sono giocate NBA, l'orario per il tennis è le 22:00 di Roma.
- `daAvviare(giornata, data, adesso, statoSerale, { partiteTennisNotturne = 0 } = {})` è vera anche quando non ci sono giocate NBA ma ci sono partite tennis notturne, con le stesse regole di orario e di avvio unico.
- Ordine dei passi del workflow:
  1. `npm test`;
  2. scaduto NBA (come oggi);
  3. `serale-tennis -- --raccolta` (con `continue-on-error`, solo quando l'orario è vicino: entro 60 minuti), poi `--conta`;
  4. `serale-nba -- --quando`, passando il conteggio del tennis tramite variabile d'ambiente o file;
  5. il resto come oggi (quote NBA, push, `/fire`, file di stato).

  Le chiavi `ODDS_API_KEY` e `SPORTSGAMEODDS_API_KEY` vengono dai secrets.
- Se la raccolta serale tennis fallisce, l'errore va in `erroriGiro` della giornata (aggiunta di una sola riga) e l'NBA va avanti.

- [ ] **Step 1: Test che falliscono:**
  - nessuna giocata NBA e 3 partite tennis notturne → `avvia` alle 21:20 per le 22:00;
  - nessuna delle due → `attendi`;
  - test statico: workflow `serale.yml` con il nuovo passo tennis e la stessa sequenza `/fire` → stato.
- [ ] **Step 2–4:** come sopra.
- [ ] **Step 5: Commit** `feat: giro serale unico per NBA e tennis`.

### Task 8: Istruzioni delle routine e README

**Files:** Modify `docs/routine/giro-del-mattino.md` (sezione tennis), `docs/routine/giro-serale-nba.md` → rinomina in `docs/routine/giro-serale.md` con le parti NBA e tennis, `README.md`. Tests: `test/giro/routine-doc.test.js`.

**Interfaces:**
- **Mattino:** notizie tennis. Ritiro annunciato → esclusione; infortunio o malessere noto, o partita molto lunga il giorno prima → correzione ±0,08 su `Vincente incontro`. Esempio di `idCandidato` tennis, verificato con `src/giro/id.js`.
- **Sera:**
  - parte NBA come oggi;
  - parte tennis: se `data/raccolta/<data>-serale-tennis.json` ha partite, si cercano le notizie su di esse e si scrive `data/raccolta/<data>-serale-tennis-notizie.json` nel formato del mattino; poi `npm run serale-tennis -- --aggiungi`;
  - commit "Giro serale <data>", stesso ciclo di push;
  - in tutto al massimo 10 ricerche web.
- Il prompt della routine serale va aggiornato al nuovo nome del documento (nel Task 9).
- **README:** tennis, cioè il mercato, i ritiri, il giro della sera prima e i tornei coperti; nessuna chiave nuova.

- [ ] **Step 1–4:** test delle stringhe obbligatorie → scrivi → `npm test` PASS.
- [ ] **Step 5: Commit** `docs(tennis): istruzioni delle routine e README`.

### Task 9: Collaudo e messa in servizio (controller)

- [ ] Unisci a `main` e fai push. Aggiorna il prompt della routine serale (`trig_01GZ4ajUWTASYhCucJfRRzeM`) a `docs/routine/giro-serale.md` con `RemoteTrigger update`.
- [ ] L'utente avvia `raccolta.yml`. Controlla `data/raccolta/<data>-tennis.json`:
  - tornei e crediti;
  - nomi abbinati, completando `ALIAS` se serve;
  - Elo plausibili (i primi 10 del mondo sopra 1900);
  - modello entro 10 punti da Pinnacle nella maggior parte dei casi.
- [ ] Confronta la regola dei ritiri con il regolamento bet365 e, se diversa, riportala all'utente.
- [ ] Prima sera con partite notturne: controlla l'aggiunta.
