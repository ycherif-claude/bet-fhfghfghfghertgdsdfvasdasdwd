# Fase 2 – Calcio: dati, modelli e giro del mattino – Piano di sviluppo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ogni giorno una raccolta su GitHub Actions scarica palinsesto, quote e statistiche del calcio e calcola le probabilità. La routine Claude delle 08:07 controlla le notizie, corregge o esclude, e scrive `data/giornate/AAAA-MM-GG.json` con `candidati`, `giocate` e `scartate` usando `selezionaGiocate` e `statoBankroll`. Un giro di riserva copre i giorni in cui Claude non gira, e gli esiti delle giocate passate vengono registrati.

**Architecture:** Codice deterministico in `src/calcio/`, così modelli, quote ed esiti sono testabili con dati di prova. `src/giro/` trasforma la raccolta più le notizie nel file della giornata. Il lavoro è diviso così:
- `raccolta.yml`, alle 05:35 UTC: dati ed esiti;
- la routine Claude, alle 08:07: notizie e giro;
- `riserva.yml`, alle 09:45 UTC: giro senza notizie.

Tutti scrivono su `main`, e il sito si ripubblica.

**Tech Stack:** Node.js 24 (moduli ES, `node:test`, `fetch` nativo, nessun pacchetto npm), GitHub Actions, routine Claude Code nel cloud.

**Spec:** `docs/superpowers/specs/2026-10-19-fase-2-calcio-design.md` (approvato), oltre a `docs/progetto-automazione-scommesse.md` e al "Modello dati" di `docs/superpowers/plans/2026-10-19-fase-1-fondamenta.md`.

## Global Constraints

- I file di Fase 1 in `src/regole/`, `src/bankroll/` e `src/storico/` non si modificano. `src/build/costruisci-sito.js` cambia solo per esportare funzioni già presenti (Task 8).
- Formato di `data/giornate/AAAA-MM-GG.json` come nel "Modello dati" della Fase 1. Si possono aggiungere solo campi opzionali: `giro: "claude"|"riserva"`, `notizieControllate: boolean` sulla giornata; `probModello`, `probPinnacle`, `correzioneNotizie` sui candidati e sulle giocate.
- `sport` vale sempre `"calcio"`.
- Il giro DEVE scrivere sia `giocate` sia `scartate`, ottenute da `selezionaGiocate(candidati, stato)` con `stato = statoBankroll(giocateGiorniPrecedenti, segnature, adesso)`.
- Fuso `Europe/Rome`. La raccolta lavora sulla data di Roma di oggi, perché gira prima delle 08:00. Il giro usa `giornataDi(adesso)`.
- Nessun pacchetto npm. Ogni testo visibile è in italiano.
- Chiavi solo da variabili d'ambiente: `ODDS_API_KEY`, `FOOTBALL_DATA_ORG_KEY`. Non vanno mai scritte in file, log o messaggi di commit.
- Soglie dello spec in `CONFIG.calcio` (Task 1), con questi valori esatti:
  - media modello/Pinnacle `0.5`;
  - scarto massimo da Pinnacle `0.10`;
  - correzione massima delle notizie `0.08`;
  - probabilità corretta compresa tra `0.02` e `0.98`;
  - scostamento minimo dalla frequenza del campionato per i candidati senza quota `0.10`;
  - al massimo `2` candidati senza quota al giorno;
  - al massimo `5` mercati con value positivo per partita;
  - riserva crediti `0.20`;
  - mezza vita del peso temporale `182` giorni;
  - quota di xG nella misura dei gol `0.5`;
  - minimo `3` bookmaker per la mediana;
  - arbitro considerato con almeno `5` partite;
  - `2` tentativi di ripetizione per ogni fonte.
- Ogni chiamata esterna ha 2 ripetizioni con attesa. Ogni errore di una fonte finisce in `erroriGiro` come stringa con fonte e ora: mai un errore silenzioso.
- Il CSV di football-data.co.uk si scarica al massimo una volta al giorno per file, con `User-Agent: analisi-giocate (progetto personale)`.

## Review Focus

1. **Stesso nome di squadra scritto in modo diverso** tra The Odds API, football-data.co.uk e football-data.org (per esempio "Inter" e "Internazionale", "Man City" e "Manchester City"): la partita va collegata alle sue statistiche. Se non si collega, va in `erroriGiro`, senza candidati inventati con statistiche sbagliate. → test in Task 5.
2. **Giro rifatto o arrivato tardi su una giornata già in uso** (una segnatura fatta o una partita iniziata): il file non cambia, e si aggiunge solo una riga a `erroriGiro`. → test in Task 8.
3. **Crediti delle quote quasi esauriti** (per esempio 6 rimasti il 20 del mese): si scaricano le quote solo delle competizioni con priorità più alta. Le altre vanno in `competizioniNonCoperte`, e i crediti non scendono mai sotto la riserva. → test in Task 6.
4. **Correzione di Claude fuori dalle regole** (delta 0,12, mercato "Risultato esatto", 1X2 con tre selezioni o con una terza derivata oltre 0,08, mercato inesistente): `npm run giro` si ferma con un messaggio che dice quale correzione e perché, e non scrive un file sbagliato. → test in Task 8.
5. **Squadra neopromossa con poche partite**: le probabilità restano ragionevoli, nessun lambda oltre 4 né sotto 0,2, e nessun value enorme dovuto alla mancanza di dati. → test in Task 3.

---

## Struttura dei file

```
src/config.js                       + CONFIG.calcio (Task 1)
src/calcio/competizioni.js          competizioni: chiave Odds API, codice CSV, nome italiano, priorità
src/calcio/testo.js                 slug, normalizzazione nomi, finestra della giornata
src/calcio/csv.js                   parser CSV minimo
src/calcio/squadre.js               alias dei nomi → nome canonico
src/calcio/fonti/http.js            fetch con ripetizioni ed errori leggibili
src/calcio/fonti/odds-api.js        events, odds, scores
src/calcio/fonti/football-data-uk.js    CSV storici → partite normalizzate
src/calcio/fonti/football-data-org.js   risultati recenti
src/calcio/modelli/gol.js           stima attacco/difesa, matrice Dixon-Coles
src/calcio/modelli/mercati-gol.js   mercati dei gol dalla matrice
src/calcio/modelli/conteggi.js      angoli e cartellini
src/calcio/quote.js                 mediana, Pinnacle senza margine, abbinamento eventi
src/calcio/raccolta.js              orchestrazione + CLI → data/raccolta/AAAA-MM-GG.json
src/calcio/esiti.js                 esito di una giocata, aggiornamento delle giornate passate
src/giro/notizie.js                 validazione e applicazione di correzioni ed esclusioni
src/giro/candidati.js               da raccolta + notizie a candidati, pre-scarti
src/giro/giro.js                    giro completo + CLI (--anteprima, --riserva)
docs/routine/giro-del-mattino.md    istruzioni lette dalla routine Claude
.github/workflows/raccolta.yml
.github/workflows/riserva.yml
test/calcio/…, test/giro/…, test/fixtures/calcio/…
```

## Formato di `data/raccolta/AAAA-MM-GG.json` (interno, prodotto dal Task 6, letto dal Task 8)

```json
{
  "data": "2026-10-20",
  "generataAlle": "2026-10-20T07:36:12+02:00",
  "crediti": { "usati": 8, "rimasti": 412 },
  "competizioniNonCoperte": ["Serie B: crediti insufficienti"],
  "erroriGiro": ["football-data.co.uk I2 alle 07:35: HTTP 503"],
  "partite": [{
    "idPartita": "calcio-2026-10-20-inter-lecce",
    "competizione": "Serie A", "partita": "Inter - Lecce", "casa": "Inter", "trasferta": "Lecce",
    "inizio": "2026-10-20T20:45:00+02:00",
    "modello": "dixon-coles",
    "lambda": { "casa": 1.92, "trasferta": 0.81 },
    "ragionamentoBase": ["Gol attesi: Inter 1,9 – Lecce 0,8 (gol e xG, ultime 2 stagioni)"],
    "mercati": [{
      "mercato": "1X2", "selezione": "1",
      "probModello": 0.66, "probPinnacle": 0.63,
      "quota": 1.62, "fonteQuota": "mediana di 9 bookmaker (The Odds API)", "oraQuota": "2026-10-20T07:35:40+02:00",
      "frequenzaCampionato": 0.44
    }]
  }]
}
```

- `modello` vale `"dixon-coles"` oppure `"solo-pinnacle"` (coppe e nazionali, §5.5: `probModello` null, `lambda` null).
- Ogni mercato calcolato è presente, anche quelli con value negativo.
- `quota` è null quando non c'è una quota gratuita. `frequenzaCampionato` è la frequenza storica della selezione nel campionato (null se non serve).

## Nomi dei mercati (valori esatti di `mercato` e `selezione`)

| mercato | selezione | quota gratuita | correggibile |
|---|---|---|---|
| `1X2` | `1`, `X`, `2` | sì (h2h) | sì |
| `Under/Over 1.5`, `Under/Over 2.5`, `Under/Over 3.5` | `Over 2.5`, `Under 2.5`… | sì (totals, se c'è la linea) | sì |
| `Doppia chance` | `1X`, `12`, `X2` | no | no |
| `Under/Over casa 0.5/1.5/2.5`, `Under/Over trasferta 0.5/1.5/2.5` | `Over 1.5`… | no | sì |
| `Under/Over 1° tempo 0.5`, `Under/Over 1° tempo 1.5` | `Over 0.5`… | no | sì |
| `Gol/No gol` | `Gol`, `No gol` | no | sì |
| `Risultato esatto` | `2-1` (da 0-0 a 4-4) | no | no |
| `Handicap asiatico -1.5/-1/-0.5/+0.5/+1/+1.5` (riferito alla squadra di casa) | `casa`, `trasferta` | no | no |
| `Angoli Under/Over 8.5/9.5/10.5/11.5` | `Over 9.5`… | no | sì |
| `Cartellini Under/Over 3.5/4.5/5.5` | `Over 4.5`… | no | sì |

- Correggibile = Claude può dare un `delta` (§6.1 dello spec); i mercati non correggibili si possono solo escludere.
- Cartellini = gialli + rossi (HY+AY+HR+AR).
- `id` del candidato = `${idPartita}-${slug(mercato)}-${slug(selezione)}`. `idPartita` = `calcio-${data}-${slug(casa)}-${slug(trasferta)}`, con il nome canonico da `squadre.js`.

---

### Task 1: Configurazione, competizioni e utilità

**Files:**
- Modify: `src/config.js` (aggiunge la chiave `calcio` all'oggetto congelato)
- Create: `src/calcio/competizioni.js`, `src/calcio/testo.js`, `src/calcio/csv.js`
- Test: `test/calcio/testo.test.js`, `test/calcio/csv.test.js`, `test/calcio/competizioni.test.js`

**Interfaces:**
- Produces:
  - `CONFIG.calcio` con le soglie delle Global Constraints: `pesoPinnacle`, `scartoMaxPinnacle`, `correzioneMax`, `probMin`, `probMax`, `scostamentoMinSenzaQuota`, `maxSenzaQuotaGiorno`, `maxMercatiPartita`, `riservaCrediti`, `mezzaVitaGiorni`, `pesoXg`, `minBookmaker`, `minPartiteArbitro`, `ripetizioni`; inoltre `rho: -0.08` e `golMaxMatrice: 10`.
  - `COMPETIZIONI: { chiave, nome, csv: string|null, priorita: 1|2|3, modello: 'dixon-coles'|'solo-pinnacle' }[]`:
    - priorità 1: `soccer_epl`/E0/"Premier League", `soccer_spain_la_liga`/SP1/"LaLiga", `soccer_italy_serie_a`/I1/"Serie A", `soccer_germany_bundesliga`/D1/"Bundesliga", `soccer_france_ligue_one`/F1/"Ligue 1", `soccer_uefa_champs_league`/null/"Champions League", `soccer_uefa_europa_league`/null/"Europa League";
    - priorità 2: `soccer_netherlands_eredivisie`/N1/"Eredivisie", `soccer_portugal_primeira_liga`/P1/"Primeira Liga", `soccer_efl_champ`/E1/"Championship", `soccer_uefa_nations_league`/null/"Nations League", `soccer_fifa_world_cup_qualifiers_europe`/null/"Qualificazioni Mondiali";
    - priorità 3: `soccer_italy_serie_b`/I2/"Serie B", `soccer_spain_segunda_division`/SP2/"Segunda División", `soccer_germany_bundesliga2`/D2/"2. Bundesliga", `soccer_france_ligue_two`/F2/"Ligue 2".
    - Il modello è `dixon-coles` quando `csv` non è null.
  - `slug(testo): string`: minuscole, senza accenti, `[^a-z0-9]+` → `-`, senza trattini ai bordi.
  - `normalizzaNome(nome): string`: slug senza i token `fc`, `cf`, `ac`, `afc`, `sc`, `ssc`, `as`, `us`, `calcio`, `club`, `de`, `1`.
  - `finestraGiornata(data: 'AAAA-MM-GG'): { da: Date, a: Date }`: dalle 08:00 di Roma di `data` alle 08:00 di Roma del giorno dopo.
  - `dataRoma(istante: Date): 'AAAA-MM-GG'`: data di calendario a Roma, da `partiRoma`.
  - `leggiCsv(testo): object[]`: prima riga come intestazione, BOM tolto, campi vuoti come stringa vuota. Le virgolette doppie sono gestite.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
test('slug toglie accenti e simboli', () => assert.equal(slug('Atlético  Madrid!'), 'atletico-madrid'));
test('normalizzaNome toglie i prefissi societari', () => assert.equal(normalizzaNome('AC Milan'), normalizzaNome('Milan')));
test('finestraGiornata attraversa il cambio dell\'ora', () => {
  const { da, a } = finestraGiornata('2026-10-24');
  assert.equal(da.toISOString(), '2026-10-24T06:00:00.000Z');
  assert.equal(a.toISOString(), '2026-10-25T07:00:00.000Z');
});
test('dataRoma alle 07:35 restituisce oggi, non ieri', () =>
  assert.equal(dataRoma(new Date('2026-10-20T05:35:00Z')), '2026-10-20'));
test('leggiCsv con BOM e virgolette', () =>
  assert.deepEqual(leggiCsv('﻿Div,HomeTeam\nE0,"Brighton, Hove"\n'), [{ Div: 'E0', HomeTeam: 'Brighton, Hove' }]));
test('17 competizioni, ognuna con nome italiano e priorità 1-3', () => {
  assert.equal(COMPETIZIONI.length, 17);
  assert.ok(COMPETIZIONI.every((c) => c.nome && [1, 2, 3].includes(c.priorita)));
});
test('CONFIG.calcio congelato con i valori dello spec', () => {
  assert.equal(CONFIG.calcio.correzioneMax, 0.08);
  assert.equal(CONFIG.calcio.scartoMaxPinnacle, 0.10);
  assert.ok(Object.isFrozen(CONFIG.calcio));
});
```

- [ ] **Step 2: Esegui** `node --test test/calcio/`. Atteso: FAIL (moduli mancanti).
- [ ] **Step 3: Implementa** i tre file e la chiave `calcio` in `src/config.js`.
- [ ] **Step 4: Esegui** `npm test`. Atteso: tutti PASS, compresi i 95 della Fase 1.
- [ ] **Step 5: Commit** `feat(calcio): configurazione, competizioni e utilità`.

### Task 2: Fonti dati

**Files:**
- Create: `src/calcio/fonti/http.js`, `src/calcio/fonti/odds-api.js`, `src/calcio/fonti/football-data-uk.js`, `src/calcio/fonti/football-data-org.js`
- Create: `test/fixtures/calcio/` con `events-serie-a.json`, `odds-serie-a.json`, `scores-europa.json`, `I1.csv` (circa 40 righe reali, colonne del CSV 2026/27), `fdorg-matches.json`. Le fixture JSON seguono i formati documentati di The Odds API v4 e di football-data.org v4.
- Test: `test/calcio/fonti.test.js`

**Interfaces:**
- Consumes: `CONFIG.calcio.ripetizioni`, `leggiCsv`, `COMPETIZIONI`.
- Produces (ogni funzione accetta `opzioni = { fetch = globalThis.fetch, attesaMs = 2000 }`, così i test iniettano un `fetch` finto):
  - `scarica(url, { fetch, attesaMs, headers }): Promise<{ status, headers, testo }>`. Riprova `ripetizioni` volte su errore di rete o status 5xx/429, poi lancia `Error("<host>: <motivo>")`. Togli `apiKey=` dall'URL nel messaggio.
  - `oddsApi.eventi(chiave, { da, a }, opz): Promise<{ eventi: {id, casa, trasferta, inizio}[], rimasti: number|null }>`. `rimasti` viene dall'intestazione `x-requests-remaining`.
  - `oddsApi.quote(chiave, { da, a }, opz): Promise<{ eventi: EventoQuote[], rimasti, usati }>`, con regione `eu`, mercati `h2h,totals` e formato `decimal`. `EventoQuote = { id, casa, trasferta, inizio, bookmaker: [{ chiave, aggiornato, mercati: { h2h?: {casa, pareggio, trasferta}, totals?: { [linea]: { over, under } } } }] }`.
  - `oddsApi.risultati(chiave, opz): Promise<Risultato[]>`, con `daysFrom=3`.
  - `footballDataUk.partite(codice, stagioni: string[], opz): Promise<PartitaStorica[]>`. `PartitaStorica = { data: 'AAAA-MM-GG', casa, trasferta, gc, gt, gcPT, gtPT, xgC: number|null, xgT: number|null, angoliC, angoliT, cartC, cartT, arbitro: string|null }`. La data del CSV è `gg/mm/aaaa`. Una riga senza gol (partita non giocata) viene saltata.
  - `footballDataOrg.risultati({ da, a }, opz): Promise<Risultato[]>`. Usa `/v4/matches` con intestazione `X-Auth-Token` e prende solo `status: FINISHED`.
  - `Risultato = { casa, trasferta, inizio, gc, gt, gcPT: number|null, gtPT: number|null, angoliC?: number, angoliT?: number, cartC?: number, cartT?: number, fonte }`.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
test('scarica riprova 2 volte su 503 e poi riesce', async () => { /* fetch finto: 503, 503, 200 → ok, 3 chiamate */ });
test('scarica: dopo 3 errori lancia un errore con l\'host e senza la chiave', async () => {
  await assert.rejects(scarica('https://api.the-odds-api.com/v4/x?apiKey=SEGRETA', { fetch: falliscePer(3), attesaMs: 0 }),
    (e) => e.message.includes('api.the-odds-api.com') && !e.message.includes('SEGRETA'));
});
test('oddsApi.quote converte la fixture e legge i crediti', async () => {
  const r = await oddsApi.quote('soccer_italy_serie_a', finestra, fixture('odds-serie-a.json', { 'x-requests-remaining': '412', 'x-requests-used': '88' }));
  assert.equal(r.rimasti, 412);
  assert.ok(r.eventi[0].bookmaker.some((b) => b.chiave === 'pinnacle'));
  assert.ok(r.eventi[0].bookmaker[0].mercati.totals['2.5'].over > 1);
});
test('footballDataUk.partite legge data gg/mm/aaaa, xG, angoli e cartellini', async () => {
  const [p] = await footballDataUk.partite('I1', ['2627'], fixtureCsv('I1.csv'));
  assert.match(p.data, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof p.xgC, 'number');
  assert.equal(p.cartC, Number(rigaGrezza.HY) + Number(rigaGrezza.HR));
});
test('footballDataOrg.risultati tiene solo le partite FINISHED', async () => { /* … */ });
```

- [ ] **Step 2: Esegui** `node --test test/calcio/fonti.test.js`. Atteso: FAIL.
- [ ] **Step 3: Implementa** i quattro moduli. L'URL di football-data.co.uk è `https://www.football-data.co.uk/mmz4281/${stagione}/${codice}.csv`; il redirect a `football-data.co.uk` si segue.
- [ ] **Step 4: Esegui** `npm test`. Atteso: PASS.
- [ ] **Step 5: Commit** `feat(calcio): fonti dati gratuite`.

### Task 3: Modello dei gol (Dixon-Coles) e mercati dei gol

**Files:**
- Create: `src/calcio/modelli/gol.js`, `src/calcio/modelli/mercati-gol.js`
- Test: `test/calcio/modelli-gol.test.js`

**Interfaces:**
- Consumes: `PartitaStorica[]` (Task 2), `CONFIG.calcio`.
- Produces:
  - `stimaForze(partite: PartitaStorica[], { oggi: 'AAAA-MM-GG', squadreUltimaStagione: Set<string> }): Forze`, dove `Forze = { attacco: Map<nome, n>, difesa: Map<nome, n>, casa: number, mediaGol: number, quotaPT: number, partiteSquadra: Map<nome, n> }`.
  - `lambda(forze, casa, trasferta): { casa: number, trasferta: number } | null`. Restituisce null se una squadra è sconosciuta.
  - `matrice(lambdaCasa, lambdaTrasferta, rho = CONFIG.calcio.rho): number[][]`, da 0 a `golMaxMatrice` gol per lato, normalizzata a somma 1.
  - `mercatiGol(lambdaCasa, lambdaTrasferta, quotaPT): { mercato, selezione, prob }[]`, con tutti i mercati dei gol della tabella "Nomi dei mercati".
  - `frequenzeGol(partite): Map<'mercato|selezione', number>`, la frequenza storica nel campionato con peso temporale.

Metodo da seguire (il test non lo determina):
- Misura dei gol `y = pesoXg·xG + (1 − pesoXg)·gol`; se manca l'xG, si usano i soli gol.
- Peso `w = 0.5^(giorni/mezzaVitaGiorni)`.
- 50 iterazioni alternate di stima moltiplicativa (Maher), con λ_casa = att_c·dif_t·casa e λ_trasf = att_t·dif_c:
  - `att_i = Σw·y_segnati / Σw·(dif_avv·fattoreCasa)`;
  - `dif_i` in modo simmetrico;
  - `casa = Σw·y_casa / Σw·att_c·dif_t`;
  - a ogni iterazione la media degli attacchi si normalizza a 1.
- Restringimento verso un valore di partenza con 5 partite fittizie: `(Σw·stima + 5·prior)/(Σw + 5)`. Il prior è `att 1, dif 1`, oppure `att 0.85, dif 1.15` per le squadre assenti da `squadreUltimaStagione`, cioè le neopromosse.
- Correzione Dixon-Coles τ sulle celle 0-0, 1-0, 0-1 e 1-1 con `rho`, poi si rinormalizza.
- Primo tempo: λ·quotaPT con Poisson indipendente.
- Handicap asiatico con linee intere: la differenza esatta pari alla linea è un rimborso. Si calcola quindi `prob = P(vinta) / (1 − P(rimborso))`, la probabilità condizionata usata per il value.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
test('matrice: somma 1 e P(0-0) corretta da rho', () => {
  const m = matrice(1.5, 1.1);
  assert.ok(Math.abs(m.flat().reduce((a, b) => a + b) - 1) < 1e-9);
  assert.ok(m[0][0] > poisson(0, 1.5) * poisson(0, 1.1));      // rho negativo alza lo 0-0
});
test('mercatiGol: 1X2 somma 1, Over 2.5 + Under 2.5 = 1, Gol + No gol = 1', () => { /* … */ });
test('mercatiGol con λ 1.5/1.1: P(1) ≈ 0.46 ± 0.02, Over 2.5 ≈ 0.50 ± 0.03', () => { /* … */ });
test('stimaForze su campionato sintetico: la squadra che segna di più ha attacco > 1, vantaggio casa > 1', () => { /* … */ });
test('peso temporale: una partita di 182 giorni fa conta la metà di una di oggi', () => { /* … */ });
test('neopromossa con 2 partite: λ tra 0.2 e 4 e attacco vicino a 0.85', () => { /* Review Focus 5 */ });
test('lambda con squadra sconosciuta restituisce null', () => assert.equal(lambda(forze, 'Inter', 'Sconosciuta'), null));
test('stima su fixture I1.csv reale: tutte le squadre hanno attacco e difesa tra 0.4 e 2.5', () => { /* … */ });
```

- [ ] **Step 2: Esegui** `node --test test/calcio/modelli-gol.test.js`. Atteso: FAIL.
- [ ] **Step 3: Implementa** `gol.js` e `mercati-gol.js`.
- [ ] **Step 4: Esegui** `npm test`. Atteso: PASS.
- [ ] **Step 5: Commit** `feat(calcio): modello Dixon-Coles e mercati dei gol`.

### Task 4: Angoli e cartellini

**Files:**
- Create: `src/calcio/modelli/conteggi.js`
- Test: `test/calcio/conteggi.test.js`

**Interfaces:**
- Consumes: `PartitaStorica[]`, `CONFIG.calcio`.
- Produces:
  - `mercatiConteggi(partite, casa, trasferta, { oggi, arbitro: string|null }): { mercato, selezione, prob, frequenzaCampionato }[]`, per le linee della tabella "Nomi dei mercati". Restituisce `[]` se una delle due squadre ha meno di 3 partite.
  - Atteso angoli = `(fattiCasa_inCasa · subitiTrasf_inTrasferta) / mediaCampionato_inCasa` + l'analogo per gli angoli della squadra in trasferta, con tassi pesati nel tempo (stessa mezza vita).
  - Cartellini: lo stesso metodo, moltiplicato per `mediaArbitro / mediaCampionato` solo se l'arbitro ha almeno `minPartiteArbitro` partite.
  - Distribuzione: Poisson, oppure binomiale negativa con la varianza empirica del campionato se `varianza/media > 1.2`.
  - `frequenzaCampionato` = quota pesata delle partite del campionato con quella selezione vincente.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
test('Over 9.5 + Under 9.5 = 1 per gli angoli', () => { /* … */ });
test('due squadre con molti angoli: P(Over 10.5) > frequenza del campionato', () => { /* … */ });
test('arbitro con 4 partite ignorato, con 5 partite sposta la media dei cartellini', () => { /* … */ });
test('squadra con 2 partite: nessun mercato', () => assert.deepEqual(mercatiConteggi(poche, 'A', 'B', opz), []));
test('frequenzaCampionato coincide con la quota di partite sopra la linea (pesi uguali)', () => { /* … */ });
```

- [ ] **Step 2–4:** come sopra (FAIL → implementa → `npm test` PASS).
- [ ] **Step 5: Commit** `feat(calcio): modello di angoli e cartellini`.

### Task 5: Quote, Pinnacle e abbinamento delle squadre

**Files:**
- Create: `src/calcio/quote.js`, `src/calcio/squadre.js`
- Test: `test/calcio/quote.test.js`, `test/calcio/squadre.test.js`

**Interfaces:**
- Consumes: `EventoQuote` (Task 2), `normalizzaNome`, `CONFIG.calcio.minBookmaker`.
- Produces:
  - `ALIAS: Record<string, string>`: da `normalizzaNome(nomeQualsiasi)` al nome canonico, cioè il nome di The Odds API. Va riempita per le 12 leghe con CSV. Per le altre, il Task 10 la completa con i dati reali.
  - `nomeCanonico(nome, candidati: string[]): string|null`. L'ordine è: alias esatto; poi `normalizzaNome` uguale; poi un solo candidato i cui token normalizzati contengono tutti quelli dell'altro nome. Altrimenti `null`, senza tentativi a caso.
  - `quotaMediana(evento, mercato: 'h2h'|'totals', selezione, linea?): { quota, n } | null`. Esclude `betfair_ex_eu`, `matchbook` e `smarkets`. Restituisce null con meno di `minBookmaker` bookmaker. Con un numero pari di quote, la media delle due centrali, arrotondata a 2 decimali per difetto.
  - `probPinnacle(evento, mercato, linea?): Record<selezione, number> | null`. Toglie il margine in modo proporzionale (`(1/q_i)/Σ(1/q_j)`). Restituisce null se Pinnacle manca.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
test('Man City, Manchester City e Manchester City FC portano allo stesso nome', () => { /* Review Focus 1 */ });
test('Inter e Internazionale tramite ALIAS', () => assert.equal(nomeCanonico('Internazionale', ['Inter', 'Lecce']), 'Inter'));
test('nome ambiguo (due candidati) restituisce null', () => assert.equal(nomeCanonico('United', ['Manchester United', 'Newcastle United']), null));
test('mediana esclude gli exchange e richiede 3 bookmaker', () => { /* … */ });
test('Pinnacle senza margine: 1.90/1.90 → 0.5/0.5; somma 1 su 1X2', () => { /* … */ });
test('linea totals assente da Pinnacle: probPinnacle null per quella linea', () => { /* … */ });
```

- [ ] **Step 2–4:** come sopra.
- [ ] **Step 5: Commit** `feat(calcio): quote mediane, Pinnacle e nomi delle squadre`.

### Task 6: Raccolta (orchestrazione, budget dei crediti, workflow)

**Files:**
- Create: `src/calcio/raccolta.js`, `.github/workflows/raccolta.yml`
- Modify: `package.json` (script `"raccolta": "node src/calcio/raccolta.js"`)
- Test: `test/calcio/raccolta.test.js`

**Interfaces:**
- Consumes: tutto il codice dei Task 1-5.
- Produces:
  - `budgetCrediti(rimasti: number, oggi: 'AAAA-MM-GG', totaleMese = 500): number = max(0, floor((rimasti − riservaCrediti·totaleMese) / giorniRimanenti))`, con `giorniRimanenti` che include oggi, fino alla fine del mese di calendario.
  - `scegliCompetizioni(conPartite: Competizione[], budget): { scelte, scoperte }`. Ordina per priorità e prende finché `2·n ≤ budget`.
  - `eseguiRaccolta({ data, adesso, fonti, chiavi }): Promise<Raccolta>`, che restituisce l'oggetto nel formato "data/raccolta" sopra. `fonti` è l'oggetto dei moduli del Task 2, iniettabile nei test. Passi:
    1. eventi di ogni competizione nella finestra (gratuiti);
    2. budget e scelta delle competizioni;
    3. quote;
    4. CSV delle stagioni `2627`, `2526` e `2425` delle leghe coinvolte;
    5. per ogni evento, abbinamento dei nomi, lambda, `mercatiGol`, `mercatiConteggi` (solo leghe con CSV), mediana e Pinnacle per 1X2 e Under/Over 1.5/2.5/3.5;
    6. `ragionamentoBase` con i gol attesi e la fonte.
    - L'arbitro non è noto la mattina, quindi `arbitro: null`.
    - Per le competizioni `solo-pinnacle`: solo 1X2 e totals con `probModello: null`.
    - Una partita senza abbinamento va in `erroriGiro` come "Squadre non riconosciute: <nome> (<competizione>)".
  - CLI: `node src/calcio/raccolta.js [--data AAAA-MM-GG]`. Scrive `data/raccolta/<data>.json`; senza `--data` usa `dataRoma(new Date())`. Se manca `ODDS_API_KEY`, esce con codice 1 e il messaggio "Manca ODDS_API_KEY".

- [ ] **Step 1: Scrivi i test che falliscono**

```js
test('budget: 412 rimasti il 20 ottobre → floor((412−100)/12) = 26', () => assert.equal(budgetCrediti(412, '2026-10-20'), 26));
test('budget sotto la riserva → 0', () => assert.equal(budgetCrediti(90, '2026-10-20'), 0));
test('crediti quasi finiti: 6 rimasti il 20 → nessuna quota, tutte scoperte, nessuna chiamata a quote()', async () => { /* Review Focus 3 */ });
test('budget 4 con Serie A, Serie B, Eredivisie: prese Serie A ed Eredivisie, Serie B in competizioniNonCoperte', () => { /* … */ });
test('eseguiRaccolta con fonti finte: ogni partita ha idPartita stabile e mercati 1X2 con probModello e probPinnacle', async () => { /* … */ });
test('fonte CSV che fallisce: la partita resta senza modello, errore in erroriGiro con nome fonte e ora', async () => { /* … */ });
test('Champions League: modello "solo-pinnacle", probModello null, niente angoli', async () => { /* … */ });
test('partite fuori dalla finestra 08:00–08:00 escluse', async () => { /* … */ });
```

- [ ] **Step 2–4:** come sopra.
- [ ] **Step 5: Scrivi `.github/workflows/raccolta.yml`.**
  - Attivazione: `schedule: - cron: '35 5 * * *'` e `workflow_dispatch`.
  - `permissions: contents: write, actions: write`; `concurrency: group: dati`.
  - Passi:
    1. checkout e Node 24;
    2. `npm test`;
    3. `npm run raccolta`, con `env` `ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}` e `FOOTBALL_DATA_ORG_KEY: ${{ secrets.FOOTBALL_DATA_ORG_KEY }}`;
    4. `git add data/`, commit "Raccolta AAAA-MM-GG" come `github-actions[bot]` solo se ci sono cambiamenti, poi `git pull --rebase` e `git push`;
    5. `gh workflow run pubblica.yml` con `GH_TOKEN: ${{ github.token }}`. Serve perché i push fatti con `GITHUB_TOKEN` non avviano `pubblica.yml`.
- [ ] **Step 6: Commit** `feat(calcio): raccolta giornaliera e workflow`.

### Task 7: Esiti

**Files:**
- Create: `src/calcio/esiti.js`
- Modify: `src/calcio/raccolta.js` (la CLI aggiorna gli esiti prima della raccolta)
- Test: `test/calcio/esiti.test.js`

**Interfaces:**
- Consumes: `Risultato` (Task 2), `nomeCanonico`, `slug`, i file `data/giornate/*.json`.
- Produces:
  - `esitoSelezione(mercato, selezione, r: Risultato): 'vinta'|'persa'|'rimborsata'|null`, per tutti i mercati della tabella. Restituisce null se mancano i dati necessari (per esempio angoli non ancora disponibili). Handicap con linea intera e differenza uguale: `rimborsata`.
  - `esitoGiocata(giocata, risultatiPerPartita: Map<idPartita, Risultato>)`. Una multipla si calcola dalle `gambe`: `persa` se una gamba è persa; `null` se una gamba è null; `rimborsata` se tutte rimborsate; altrimenti `vinta`. Una gamba rimborsata vale 1 nel prodotto: è una semplificazione accettata, perché il modello dati non ha una quota ricalcolata.
  - `aggiornaEsiti(dirData, risultati: Risultato[], adesso): { aggiornate: number, file: string[] }`. Considera solo le giocate con `esito: null`, `stato !== 'annullata'` e `inizio + 3h < adesso`. Modifica **solo** il campo `esito` (le altre parti del file restano identiche, `JSON.stringify(…, null, 2)`). L'abbinamento usa `idPartita` ricostruito da nomi canonici e data di Roma dell'inizio.
  - Nella CLI della raccolta: si scaricano i risultati da football-data.org (finestra degli ultimi 4 giorni) e i CSV già scaricati per la raccolta (che danno gol, angoli e cartellini). `oddsApi.risultati` si chiama solo per le competizioni con giocate ancora senza esito non coperte da football-data.org (nessun CSV e non Champions League), spendendo 2 crediti, e prima del budget delle quote.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
test('1X2, Under/Over, Gol/No gol, risultato esatto, primo tempo su 2-1 (PT 1-0)', () => { /* tabella di casi */ });
test('handicap asiatico -1 su 2-1: rimborsata; -1.5 su 2-1: persa', () => { /* … */ });
test('angoli senza dati: null, la giocata resta in corso', () => assert.equal(esitoSelezione('Angoli Under/Over 9.5', 'Over 9.5', { gc: 1, gt: 0 }), null));
test('multipla: una gamba persa → persa; una gamba senza dati → null', () => { /* … */ });
test('aggiornaEsiti cambia solo il campo esito e non tocca le giocate annullate', () => { /* cartella temporanea */ });
test('partita iniziata da meno di 3 ore: nessun esito', () => { /* … */ });
```

- [ ] **Step 2–4:** come sopra.
- [ ] **Step 5: Commit** `feat(calcio): esiti delle giocate`.

### Task 8: Giro (notizie, candidati, selezione, scrittura protetta)

**Files:**
- Create: `src/giro/notizie.js`, `src/giro/candidati.js`, `src/giro/giro.js`
- Modify: `src/build/costruisci-sito.js` (aggiungi `export` a `leggiJson`, `erroreGiocata`, `erroreSegnatura`; nessun altro cambiamento), `package.json` (script `"giro": "node src/giro/giro.js"`)
- Test: `test/giro/notizie.test.js`, `test/giro/candidati.test.js`, `test/giro/giro.test.js`

**Interfaces:**
- Consumes: formato della raccolta, `selezionaGiocate`, `statoBankroll`, `giornataDi`, `calcolaValue`, `CONFIG.calcio`.
- Produces:
  - `validaNotizie(notizie, raccolta): string[]`, cioè l'elenco degli errori in italiano (vuoto se va tutto bene). Regole:
    - mercato e selezione esistenti nella partita;
    - mercato correggibile (tabella);
    - `|delta| ≤ correzioneMax`;
    - partita non `solo-pinnacle`;
    - `motivo` e `fonte` non vuoti;
    - nell'1X2 al massimo 2 selezioni corrette, e la terza derivata `−(d1+d2)` con `|·| ≤ correzioneMax`;
    - probabilità risultante tra `probMin` e `probMax`.
  - `applicaCorrezioni(partita, correzioni): partita`, che restituisce una copia con `probModello` corretto e il campo `correzioneNotizie` sul mercato. Nei mercati a 2 selezioni la complementare riceve `−delta`; nell'1X2 la terza selezione riceve `−(d1+d2)`.
  - `costruisciCandidati(raccolta, notizie|null): { candidati: Candidato[], preScartate: {idCandidato, motivo}[] }`. Per ogni mercato si calcola `prob`:
    - `pesoPinnacle·probPinnacle + (1−pesoPinnacle)·probModello` quando ci sono entrambe;
    - altrimenti quella disponibile.

    Poi si costruiscono i candidati:
    - con quota: per ogni partita i primi `maxMercatiPartita` per value, purché `> 0`;
    - senza quota: `|probModello − frequenzaCampionato| ≥ scostamentoMinSenzaQuota` e quota giusta `1/prob` tra 1.60 e 3.00. Al massimo `maxSenzaQuotaGiorno` in tutta la giornata, quelli con lo scostamento maggiore, con `quotaDaVerificare: true`, `quota: null`, `fonteQuota: null`, `oraQuota: null`.
    - Una partita `solo-pinnacle` non produce candidati senza quota.

    Infine i pre-scarti, che restano anche in `candidati`:
    - `|probModello − probPinnacle| > scartoMaxPinnacle`, calcolato dopo la correzione, con motivo "stima troppo lontana dal mercato";
    - esclusioni con motivo `"notizia: " + motivo`. Un'esclusione con solo `idPartita` scarta tutti i candidati della partita.

    Ogni candidato ha `tipo: 'singola'`, `sport: 'calcio'`, `probModello`, `probPinnacle` e `correzioneNotizie`. Il `ragionamento` ha 3-4 righe:
    - `ragionamentoBase`;
    - "Modello X%, Pinnacle Y%, probabilità usata Z%" (oppure "Solo modello" o "Solo Pinnacle");
    - "Quota mediana Q su N bookmaker alle HH:MM" oppure "Quota da verificare su bet365";
    - la riga notizie: "Notizie: <motivo> (<fonte>, HH:MM) → <selezione>: modello da A% a B%, finale C%", oppure "Notizie controllate alle HH:MM: nessuna correzione", oppure "Notizie non controllate: giro di Claude non eseguito".
  - `puoScrivere(fileEsistente|null, segnature, adesso, modo): { ok: boolean, motivo?: string }`. Restituisce false se:
    - il file è di Claude e il modo è riserva;
    - una giocata del file ha una segnatura;
    - una partita del file è iniziata.

    Un file con `esempio: true` si può sempre sostituire.
  - `eseguiGiro({ dirData, adesso, modo: 'claude'|'riserva', anteprima = false }): { scritto: boolean, giornata, anteprima?: { partite: string[] } }`:
    - legge `data/raccolta/<oggi>.json` e, in modo claude, `<oggi>-notizie.json`;
    - se le notizie non sono valide lancia `Error` con tutti gli errori;
    - con raccolta mancante o di un altro giorno produce `candidati: []` e l'errore "Raccolta di oggi mancante";
    - lo stato viene da `statoBankroll(giocate valide di tutte le giornate tranne oggi, segnature valide, adesso)`;
    - le giocate e le scartate vengono da `selezionaGiocate(candidati non pre-scartati, stato)`, e `scartate = [...preScartate, ...scartate]`;
    - la giornata ha `{ data, generataAlle, giro: modo, notizieControllate, competizioniNonCoperte, candidati, giocate, scartate, erroriGiro }`;
    - prima di scrivere chiama `puoScrivere`. Se restituisce false, aggiunge a `erroriGiro` del file esistente "Giro <modo> delle HH:MM non applicato: giornata già in uso" e non tocca altro.
  - Anteprima: nessuna scrittura. Restituisce gli `idPartita` delle giocate più quelli delle 5 partite successive per value.
  - CLI: `node src/giro/giro.js [--anteprima] [--riserva]`. Con `--anteprima` stampa una riga per partita: `idPartita · partita · inizio · mercati in gara`.

- [ ] **Step 1: Scrivi i test che falliscono** (Review Focus 2 e 4)

```js
test('correzione di 0.12 rifiutata con messaggio che cita mercato e partita', () => { /* … */ });
test('correzione su Risultato esatto rifiutata: solo esclusione', () => { /* … */ });
test('1X2: correzioni -0.05 su "1" e -0.05 su "X" → "2" +0.10 rifiutata (oltre 0.08)', () => { /* … */ });
test('Over 2.5 -0.05 → Under 2.5 +0.05; con Pinnacle la finale scende di 0.025', () => { /* … */ });
test('correzione che porta oltre 10 punti da Pinnacle → pre-scarto "stima troppo lontana dal mercato"', () => { /* … */ });
test('correzione che porta un mercato sopra soglia lo fa entrare', () => { /* … */ });
test('esclusione per partita: tutti i candidati con motivo "notizia: …"', () => { /* … */ });
test('senza quota: al massimo 2 al giorno, solo con scostamento ≥ 10 punti', () => { /* … */ });
test('al massimo 5 mercati con quota per partita, solo value > 0', () => { /* … */ });
test('eseguiGiro scrive giocate e scartate, giro "claude", notizieControllate true', () => { /* cartella temporanea */ });
test('riserva: nessuna correzione, ragionamento "Notizie non controllate", giro "riserva"', () => { /* … */ });
test('riserva non sovrascrive un file del giro claude', () => { /* … */ });
test('giornata con una segnatura: file invariato salvo la riga in erroriGiro', () => { /* … */ });
test('giornata con partita iniziata: file invariato', () => { /* … */ });
test('il file d\'esempio si sostituisce', () => { /* … */ });
test('stesso input due volte → stessi id', () => { /* … */ });
test('raccolta mancante: giocate [] e scartate [] con errore leggibile', () => { /* … */ });
test('il bankroll usato esclude la giornata di oggi e conta le segnature dei giorni precedenti', () => { /* … */ });
test('la build legge la giornata scritta senza errori in erroriDati', () => { /* costruisciDati sulla stessa cartella */ });
```

- [ ] **Step 2–4:** come sopra.
- [ ] **Step 5: Commit** `feat(giro): notizie, candidati e scrittura della giornata`.

### Task 9: Riserva, istruzioni della routine e documentazione

**Files:**
- Create: `.github/workflows/riserva.yml`, `docs/routine/giro-del-mattino.md`
- Modify: `README.md`, nuova sezione "Calcio: chiavi e giro del mattino"; la sezione "Per chi sviluppa" rimanda allo spec della Fase 2
- Delete: `data/giornate/2026-10-19.json`, `data/segnature/esempio-nba-1.json` (spec §7)
- Test: `test/giro/routine-doc.test.js`

**Interfaces:**
- `riserva.yml`:
  - attivazione: `cron: '45 9 * * *'` e `workflow_dispatch`;
  - permessi e concorrenza come `raccolta.yml`;
  - esegue `npm test` e poi `npm run giro -- --riserva`;
  - commit "Giro di riserva AAAA-MM-GG" se ci sono cambiamenti, poi pull con rebase, push e `gh workflow run pubblica.yml`.
- `docs/routine/giro-del-mattino.md`, in italiano, istruzioni per Claude:
  - Node: `export PATH=/opt/node24/bin:$PATH` se esiste, poi `node --version`.
  - Lavorare su `main`: `git checkout main && git pull`.
  - `npm run giro -- --anteprima`.
  - Per ogni partita elencata, ricerca web su assenze dei titolari, squalifiche, cambio allenatore, meteo estremo e motivazioni anomale. Le fonti devono essere affidabili (siti dei club, agenzie, quotidiani sportivi), con l'ora della notizia.
  - Correzioni ed esclusioni solo per fatti concreti, secondo le regole del §6.1 dello spec, riportate per intero nel documento: limite ±0,08 sulla probabilità del modello, mercati correggibili, complementari automatiche, nessun mercato nuovo.
  - Scrivere `data/raccolta/<oggi>-notizie.json` nel formato del §7 dello spec, con `partiteControllate` sempre compilato.
  - `npm run giro`. Se fallisce per correzioni non valide, sistemarle e riprovare.
  - `npm test`.
  - `git add data/ && git commit -m "Giro del mattino <data>" && git push origin main`. Se il push viene rifiutato: `git pull --rebase` e di nuovo push. Al massimo 3 tentativi.
  - Se un passo fallisce, non inventare dati. Lasciare che lo faccia il giro di riserva, e scrivere il motivo nell'ultimo messaggio della sessione.
  - Vietato: modificare codice, test o configurazione; spingere su altri rami; cambiare file di giorni diversi da oggi.
  - Sezione "Piano B" (spec §6): se il push su `main` è rifiutato per permessi, spingere solo il file notizie su `claude/notizie-<data>`.
- README:
  - come creare le chiavi gratuite di The Odds API (the-odds-api.com, piano Starter gratuito) e di football-data.org (registrazione gratuita);
  - dove incollarle: Settings → Secrets and variables → Actions → New repository secret, con i nomi `ODDS_API_KEY` e `FOOTBALL_DATA_ORG_KEY`;
  - gli orari dei tre giri e cosa significa "Notizie non controllate".

- [ ] **Step 1: Scrivi il test che fallisce**

```js
test('le istruzioni della routine contengono i passi obbligatori', () => {
  const t = fs.readFileSync('docs/routine/giro-del-mattino.md', 'utf8');
  for (const s of ['npm run giro -- --anteprima', '-notizie.json', 'npm run giro', 'npm test', 'git push origin main', '0,08', 'claude/notizie-']) assert.ok(t.includes(s), s);
});
```

- [ ] **Step 2–4:** come sopra. Dopo aver cancellato i file d'esempio, `npm test` deve restare verde. Se un test della Fase 1 legge `data/` reale, aggiornalo per usare una cartella temporanea, senza cambiarne le asserzioni.
- [ ] **Step 5: Commit** `feat(giro): giro di riserva, istruzioni della routine e documentazione`.

### Task 10: Collaudo con dati reali (richiede le chiavi dell'utente)

- [ ] **Step 1:** l'utente crea le due chiavi e le inserisce nei secrets (README, Task 9). Push dei Task 1-9 su `main`.
- [ ] **Step 2:** avvia `raccolta.yml` a mano (`gh workflow run raccolta.yml`) e scarica `data/raccolta/<oggi>.json`. Controlla:
  - nessuna riga "Squadre non riconosciute" in `erroriGiro`;
  - `crediti.rimasti` coerente con il budget;
  - almeno una partita con `probModello` e `probPinnacle`;
  - probabilità del modello entro 10 punti da Pinnacle in almeno il 70% dei mercati 1X2 (controllo di buon senso del modello).
- [ ] **Step 3:** se ci sono nomi non riconosciuti, aggiungi gli alias in `src/calcio/squadre.js` con un test per ognuno, poi commit `fix(calcio): alias squadre` e rilancia.
- [ ] **Step 4:** in locale, `npm run giro -- --riserva` su una copia della cartella: la giornata deve risultare valida per `costruisciDati`, senza `erroriDati`. Non fare commit di questa prova.

### Task 11: Routine Claude e prima giornata reale

- [ ] **Step 1:** crea o aggiorna l'ambiente cloud "bet-calcio": rete **Trusted**, nessuna variabile, script di setup che installa Node 24.

```bash
set -e
if [ ! -x /opt/node24/bin/node ]; then
  V=$(curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt | grep -o 'node-v24[^ ]*-linux-x64.tar.xz' | head -1)
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$V" -o /tmp/node24.tar.xz
  mkdir -p /opt/node24 && tar -xJf /tmp/node24.tar.xz -C /opt/node24 --strip-components=1
fi
```

- [ ] **Step 2:** crea la routine "Giro del mattino calcio" con `/schedule` o con lo strumento delle routine. Impostazioni:
  - repository `ycherif-claude/bet-fhfghfghfghertgdsdfvasdasdwd`;
  - ambiente "bet-calcio";
  - nessun connettore;
  - pianificazione giornaliera alle **08:07 Europe/Rome**;
  - prompt: "Esegui il giro del mattino seguendo alla lettera docs/routine/giro-del-mattino.md nel repository. Lavora e fai push sul ramo main."

  Se uno di questi campi non si può impostare dallo strumento, dai all'utente i passi esatti su claude.ai/code/routines.
- [ ] **Step 3:** "Run now" della routine. Verifica che il commit "Giro del mattino <data>" sia su `main` (`git log origin/main -3`), che "Pubblica sito" sia verde e che la pagina pubblicata mostri la giornata reale, senza l'avviso "Dati di esempio". Se il push su `main` è stato rifiutato, applica il Piano B (spec §6): aggiungi a `riserva.yml` un'attivazione `push` su `claude/notizie-*` che esegue `npm run giro` con il file notizie, e ripeti il passo.
- [ ] **Step 4:** controlla l'uso dell'abbonamento dopo il run (claude.ai/settings/usage) e annotalo nella cartella delle note condivise.
- [ ] **Step 5:** `npm test` verde, commit e push degli eventuali ultimi ritocchi.
