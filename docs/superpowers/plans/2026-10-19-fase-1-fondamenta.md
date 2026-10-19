# Fase 1 – Fondamenta: regole, bankroll e pagina web – Piano di sviluppo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire il motore delle regole di gioco (value, quote, puntate, stop, tetti, multiple), il calcolo del bankroll e la pagina web (layout A, storico, pulsante "Giocata"). Tutto deve funzionare a partire da un file "giornata" in JSON, anche scritto a mano.

**Architecture:** Repository GitHub con codice Node.js senza dipendenze esterne. Le giornate (`data/giornate/AAAA-MM-GG.json`) e le segnature dell'utente (`data/segnature/<id>.json`) vengono salvate come file nel repository. Uno script di build le combina con il motore delle regole e il calcolo del bankroll in `site/dati.json`. Una GitHub Action pubblica `site/` su GitHub Pages a ogni push. La pagina scrive le segnature tramite l'API GitHub, con un token salvato una volta nel browser.

**Tech Stack:** Node.js 24 (moduli ES, `node:test`, nessun pacchetto npm), HTML/CSS/JavaScript senza framework, GitHub Actions, GitHub Pages.

**Spec:** `docs/progetto-automazione-scommesse.md`

## Fasi del progetto (contesto)

Il documento copre più sottosistemi. Il lavoro è diviso in fasi, ciascuna con un proprio piano e software funzionante alla fine:
1. **Fondamenta** (questo piano): regole, bankroll, pagina, pubblicazione.
2. **Calcio + giro del mattino**: fonti gratuite, modelli di probabilità per il calcio, routine Claude delle 08:00 che scrive la giornata.
3. **Controlli pre-partita ed esiti**: programma leggero su GitHub Actions, uno per partita, che attiva Claude se qualcosa cambia; raccolta esiti.
4. **Altri sport**: NBA, tennis, basket, pallavolo.
5. **Apprendimento**: revisione mensile dei mercati.

## Global Constraints

- Tutti i testi visibili in italiano.
- Fuso orario di riferimento: `Europe/Rome`. La settimana va da lunedì 00:00 a domenica 23:59.
- Bankroll iniziale: `200` €. Stop settimanale: `-50` €.
- Soglia di value: `0.05`. Singole speciali: `0.10`.
- Range quote: singola `1.60–3.00`; speciale `3.00–4.50` (oltre 3.00); multipla totale `2.50–6.00`, gamba ≥ `1.40`, 2–4 gambe; builder `3.00–8.00`. Gli estremi sono inclusi.
- Puntate in % del bankroll: singola `1–3`; speciale `1`; multipla `0.5–1`; builder `0.5`. Kelly frazionario `0.25`. Arrotondamento a `0.50` € per difetto. Se la puntata arrotondata è `0`, la giocata è scartata con motivo "puntata troppo bassa".
- Tetto giornaliero: `12%` del bankroll in gioco nello stesso giorno.
- Massimi giornalieri: `10` singole (speciali comprese), `2` multiple, `2` builder.
- Una sola singola per partita, quella con value più alto.
- Quota minima per i mercati senza quota gratuita: quota giusta × `1.05`; × `1.10` per speciali e builder.
- Le puntate ancora in corso contano come perse per lo stop e per il tetto. Le giocate non segnate dopo 24 ore dall'inizio della partita valgono come saltate.
- Nessun pacchetto npm: solo la libreria standard di Node.
- Il sito ha `<meta name="robots" content="noindex">` e un `robots.txt` con `Disallow: /`.

## Review Focus

1. **Manca il file della giornata di oggi** (il giro del mattino è fallito): la pagina deve dire chiaramente "Analisi di oggi non disponibile", senza mostrare quella di ieri come se fosse di oggi. → test in Task 5.
2. **Settimana a cavallo del cambio dell'ora** (25 ottobre 2026) e partite di domenica notte (NBA alle 01:30 del lunedì): l'appartenenza alla settimana si decide con l'orario di Roma. → test in Task 3.
3. **Quote esattamente sugli estremi** (1,60, 3,00, 4,50): sono incluse, e 3,00 resta una singola normale, non speciale. → test in Task 2.
4. **Bankroll calato così tanto che la puntata arrotondata vale 0 €**: la giocata va scartata con un motivo, mai proposta a 0 €. → test in Task 2.
5. **L'utente segna due volte la stessa giocata o annulla una segnatura**: vale l'ultima segnatura, e l'annullamento la toglie dal bankroll. → test in Task 3.

---

## Struttura dei file

```
package.json
src/config.js                 costanti del documento di progetto
src/regole/value.js           value, quota giusta, quota minima
src/regole/puntate.js         puntata consigliata
src/regole/selezione.js       filtri, una singola per partita, tetti, stop
src/regole/multiple.js        costruzione delle multiple
src/bankroll/settimana.js     inizio settimana in Europe/Rome
src/bankroll/bankroll.js      stato del bankroll da giocate + segnature
src/storico/riepiloghi.js     riepiloghi per sport / tipo / mercato
src/build/costruisci-sito.js  legge data/, scrive site/dati.json
data/giornate/                un file per giorno (scritto dalle fasi 2-3)
data/segnature/               un file per segnatura (scritto dalla pagina)
site/index.html               pagina del giorno (layout A)
site/storico.html             pagina storico
site/app.js                   rendering pagina del giorno
site/storico.js               rendering storico
site/giocata.js               pulsante "Giocata" e scrittura via API GitHub
site/stile.css
site/robots.txt
.github/workflows/pubblica.yml
test/…                        un file di test per ogni modulo di src/
```

## Modello dati (condiviso da tutte le fasi)

`data/giornate/AAAA-MM-GG.json`:
```json
{
  "data": "2026-10-19",
  "generataAlle": "2026-10-19T08:04:00+02:00",
  "competizioniNonCoperte": ["Liga turca volley"],
  "candidati": [ /* Candidato[] prodotti dal giro del mattino */ ],
  "giocate":   [ /* Giocata[] dopo la selezione */ ],
  "scartate":  [ { "idCandidato": "…", "motivo": "…" } ],
  "erroriGiro": []
}
```

`Candidato`: `{ id, sport: "calcio"|"tennis"|"nba"|"basket"|"pallavolo", competizione, partita, idPartita, inizio /*ISO con offset*/, tipo: "singola"|"builder", mercato, selezione, prob, quota, fonteQuota|null, oraQuota|null, quotaDaVerificare: boolean, ragionamento: string[] }`. Per i builder, `prob` è già la probabilità congiunta stimata. `sport` vale esattamente uno di questi valori, che sono anche i filtri della pagina: le partite NBA usano `"nba"`, `"basket"` è per gli altri campionati di basket.

`Giocata` = `Candidato` + `{ tipo: "singola"|"speciale"|"multipla"|"builder", value, quotaMinima, puntata: { euro, percentuale }, stato: "in_attesa"|"confermata"|"modificata"|"annullata"|"in_revisione", motivoStato: string|null, oraUltimoControllo: string|null, esito: null|"vinta"|"persa"|"rimborsata", gambe?: Candidato[] }`. Per le multiple: `id = "M-" + id delle gambe uniti con "+"`, `inizio` = inizio della prima gamba.

`data/segnature/<idGiocata>.json`: `{ idGiocata, fatta: boolean, quotaReale: number|null, puntataReale: number|null, ora }`. Un file per giocata; riscriverlo sostituisce la segnatura precedente; cancellarlo la annulla.

**Il giro del mattino DEVE scrivere `giocate` e `scartate`** nel file della giornata. La selezione in memoria fatta dalla build (`selezionaGiocate` sui `candidati` quando manca `giocate`) è solo un ripiego di visualizzazione per la giornata di oggi: una giornata passata senza `giocate` produce un errore in `erroriDati` ("Giornata <data> senza giocate: il giro del mattino deve scriverle") e le segnature che puntano alle sue giocate risultano "Segnatura senza giocata: <id>".

La build non si ferma per un file sbagliato: ogni file JSON illeggibile, ogni giocata con `inizio` non leggibile, `prob` fuori da (0, 1) o puntata non numerica, e ogni segnatura `fatta: true` con `puntataReale` non positiva o `quotaReale` ≤ 1 viene saltata e registrata in `erroriDati: [{ file, errore }]`; la pagina mostra ciascuna voce come avviso "Dati non validi in <file>: <errore>".

---

### Task 1: Progetto, configurazione e calcolo del value

**Files:**
- Create: `package.json`, `.gitignore`, `src/config.js`, `src/regole/value.js`
- Test: `test/regole/value.test.js`

**Interfaces:**
- Produces: `CONFIG` (oggetto congelato con tutte le costanti delle Global Constraints) da `src/config.js`; `calcolaValue(prob: number, quota: number): number`, `quotaGiusta(prob: number): number`, `quotaMinima(candidato: {prob, quota, quotaDaVerificare}, tipo: string): number` da `src/regole/value.js`.

- [ ] **Step 1: Inizializza il repository.** `git init`, `.gitignore` con `node_modules/`, `.superpowers/`, `site/dati.json`. `package.json` con `"type": "module"`, `"engines": {"node": ">=24"}`, script `"test": "node --test"` e `"build": "node src/build/costruisci-sito.js"`.

- [ ] **Step 2: Scrivi i test che falliscono**

```js
test('value = prob × quota − 1', () => assert.equal(round(calcolaValue(0.61, 1.85)), 0.1285));
test('quota giusta = 1/prob', () => assert.equal(round(quotaGiusta(0.5)), 2));
test('quota minima con quota gratuita: quota per cui il value è 5%', () =>
  assert.equal(round(quotaMinima({ prob: 0.6, quota: 1.9, quotaDaVerificare: false }, 'singola')), 1.75));
test('quota minima senza quota gratuita: quota giusta × 1.05', () =>
  assert.equal(round(quotaMinima({ prob: 0.5, quota: null, quotaDaVerificare: true }, 'singola')), 2.1));
test('speciali e builder usano × 1.10', () =>
  assert.equal(round(quotaMinima({ prob: 0.25, quota: null, quotaDaVerificare: true }, 'builder')), 4.4));
```
(`round` = arrotondamento a 4 decimali, definito nel file di test.)

- [ ] **Step 3: Esegui** `node --test test/regole/value.test.js`. Atteso: FAIL, modulo non trovato.

- [ ] **Step 4: Implementa `src/config.js` e `src/regole/value.js`.** La quota minima è sempre `(1 + soglia) / prob`, con soglia `0.05` o `0.10` in base al tipo. Così coincide con "quota giusta × 1,05/1,10" del documento ed è la stessa regola per quote gratuite e non. Arrotonda per eccesso a 2 decimali.

- [ ] **Step 5: Esegui i test.** Atteso: PASS.

- [ ] **Step 6: Commit** `feat: configurazione e calcolo del value`.

### Task 2: Puntate, selezione e multiple

**Files:**
- Create: `src/regole/puntate.js`, `src/regole/selezione.js`, `src/regole/multiple.js`
- Test: `test/regole/puntate.test.js`, `test/regole/selezione.test.js`, `test/regole/multiple.test.js`

**Interfaces:**
- Consumes: `CONFIG`, `calcolaValue`, `quotaMinima` (Task 1).
- Produces:
  - `classificaTipo(candidato): "singola"|"speciale"|"builder"|null` (`null` = quota fuori range).
  - `puntataConsigliata({ tipo, prob, quota, bankroll }): { euro: number, percentuale: number }`.
  - `costruisciMultiple(singole: Giocata[], bankroll: number): Giocata[]`.
  - `selezionaGiocate(candidati: Candidato[], stato: { bankroll, inGiocoOggi, stopRaggiunto, distanzaStop }): { giocate: Giocata[], scartate: {idCandidato, motivo}[] }`. La somma delle puntate proposte non supera mai `min(tetto giornaliero − inGiocoOggi, distanzaStop)`; la giocata bloccata dallo stop ha motivo "stop settimanale", quella bloccata dal tetto "tetto giornaliero". `distanzaStop` assente = nessun limite dallo stop.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
// puntate
test('Kelly 0.25 limitato a 1–3% per le singole', () => {
  assert.deepEqual(puntataConsigliata({ tipo: 'singola', prob: 0.61, quota: 1.85, bankroll: 200 }), { euro: 6, percentuale: 3 });
  assert.deepEqual(puntataConsigliata({ tipo: 'singola', prob: 0.55, quota: 1.92, bankroll: 200 }), { euro: 3, percentuale: 1.52 });
  assert.deepEqual(puntataConsigliata({ tipo: 'singola', prob: 0.35, quota: 3.0, bankroll: 200 }), { euro: 2, percentuale: 1 });
});
test('speciale fisso 1%, builder fisso 0.5%', () => {
  assert.equal(puntataConsigliata({ tipo: 'speciale', prob: 0.3, quota: 4, bankroll: 200 }).euro, 2);
  assert.equal(puntataConsigliata({ tipo: 'builder', prob: 0.2, quota: 6, bankroll: 200 }).euro, 1);
});
test('arrotonda a 0.50 per difetto', () =>
  assert.equal(puntataConsigliata({ tipo: 'singola', prob: 0.55, quota: 1.92, bankroll: 170 }).euro, 2.5));   // 1.52% di 170 = 2.59
// selezione
test('estremi inclusi: 1.60 e 3.00 singola, 3.01 speciale, 4.50 speciale, 4.51 scartata', ...);
test('value sotto 5% scartato con motivo "value insufficiente"', ...);
test('speciale con value 8% scartata', ...);
test('due singole sulla stessa partita: resta quella con value più alto', ...);
test('massimo 10 singole: restano le 10 con value più alto', ...);
test('tetto 12%: con bankroll 200 e inGiocoOggi 20, una puntata da 6 € viene scartata con motivo "tetto giornaliero"', ...);
test('stopRaggiunto: nessuna giocata, tutte scartate con motivo "stop settimanale"', ...);
test('puntata arrotondata a 0 (bankroll 30, builder): scartata con motivo "puntata troppo bassa"', ...);
test('stato iniziale delle giocate = "in_attesa"', ...);
// multiple
test('solo gambe con quota ≥ 1.40 e partite diverse, 2–4 gambe, totale 2.50–6.00, value ≥ 5%', ...);
test('al massimo 2 multiple, scelte per value più alto', ...);
test('prob della multipla = prodotto delle prob delle gambe', ...);
```
Ogni `...` è un test con candidati costruiti da un helper `candidato(overrides)` nel file di test; le asserzioni sono quelle scritte nel nome.

- [ ] **Step 2: Esegui** `node --test test/regole/`. Atteso: FAIL.

- [ ] **Step 3: Implementa `puntataConsigliata`.** Kelly: `f = (prob*quota − 1)/(quota − 1)`, `percentuale = clamp(0.25*f*100, min, max)` del tipo, arrotondata a 2 decimali (per speciale e builder è fissa), `euro = floor(bankroll*percentuale/100 / 0.5)*0.5`.

- [ ] **Step 4: Implementa `selezionaGiocate`** in questo ordine: stop → classificazione e range → soglia di value → una singola per partita → tetto 10 singole / 2 builder → multiple da `costruisciMultiple` → puntate → tetto giornaliero (si aggiungono le giocate per value decrescente finché `inGiocoOggi + somma ≤ 12% bankroll`). Ogni candidato escluso finisce in `scartate` con un motivo in italiano.

- [ ] **Step 5: Implementa `costruisciMultiple`.** Si generano tutte le combinazioni di 2–4 singole selezionate su partite diverse (al massimo 10 singole, quindi poche combinazioni), si filtrano con le regole e si tengono le 2 con value più alto che non condividono gambe tra loro.

- [ ] **Step 6: Esegui i test.** Atteso: PASS.

- [ ] **Step 7: Commit** `feat: puntate, selezione e multiple`.

### Task 3: Bankroll, settimana e stop

**Files:**
- Create: `src/bankroll/settimana.js`, `src/bankroll/bankroll.js`
- Test: `test/bankroll/settimana.test.js`, `test/bankroll/bankroll.test.js`

**Interfaces:**
- Consumes: `CONFIG`.
- Produces:
  - `inizioSettimana(istante: Date): string` (data `AAAA-MM-GG` del lunedì, ora di Roma).
  - `statoBankroll(giocate: Giocata[], segnature: Segnatura[], adesso: Date): { bankroll, risultatoSettimana, inGiocoOggi, stopRaggiunto, distanzaStop, daSegnare: string[] }`.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
test('domenica 25/10/2026 23:30 Roma (giorno del cambio ora) appartiene alla settimana del 19/10', () =>
  assert.equal(inizioSettimana(new Date('2026-10-25T22:30:00Z')), '2026-10-19'));
test('lunedì 26/10 01:30 Roma appartiene alla settimana del 26/10', () =>
  assert.equal(inizioSettimana(new Date('2026-10-26T00:30:00Z')), '2026-10-26'));
test('bankroll = 200 + profitti delle giocate fatte e chiuse, con la quota reale', ...);   // vinta 5 € @1.90 → 204.50
test('rimborsata: profitto 0', ...);
test('giocata non segnata non conta nel bankroll', ...);
test('in corso conta come persa per risultatoSettimana e stop', ...);   // −45 chiuse + 6 in corso → stopRaggiunto true
test('inGiocoOggi = somma puntate reali delle giocate fatte di oggi non ancora chiuse', ...);
test('daSegnare: giocate iniziate senza segnatura da meno di 24h', ...);
test('dopo 24h senza segnatura vale come saltata e non è in daSegnare', ...);
test('segnatura con fatta:false = saltata', ...);
test('più segnature per la stessa giocata: vale quella con ora più recente', ...);
test('distanzaStop = 50 + risultatoSettimana', ...);
```

- [ ] **Step 2: Esegui** `node --test test/bankroll/`. Atteso: FAIL.

- [ ] **Step 3: Implementa `inizioSettimana`** con `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', … })` per ricavare data e giorno della settimana a Roma, poi si torna indietro fino al lunedì.

- [ ] **Step 4: Implementa `statoBankroll`.** La settimana di una giocata è quella del suo `inizio`. Le multiple si chiudono quando hanno un `esito`.

- [ ] **Step 5: Esegui i test.** Atteso: PASS.

- [ ] **Step 6: Commit** `feat: bankroll, settimane e stop`.

### Task 4: Riepiloghi storico e build del sito

**Files:**
- Create: `src/storico/riepiloghi.js`, `src/build/costruisci-sito.js`, `data/giornate/2026-10-19.json` (esempio scritto a mano, con `"esempio": true`), `data/segnature/.gitkeep`
- Test: `test/storico/riepiloghi.test.js`, `test/build/costruisci-sito.test.js`

**Interfaces:**
- Consumes: `statoBankroll`, `selezionaGiocate`.
- Produces:
  - `riepiloga(righe: {giocata, segnatura}[], chiave: "sport"|"tipo"|"mercato"|"quotaDaVerificare", vista: "fatte"|"proposte"): { gruppo, n, vinte, profitto, roi }[]`. Nella vista "proposte" si usa la quota e la puntata consigliata.
  - `costruisciDati(dirData: string, adesso: Date): DatiSito`; la CLI scrive `site/dati.json`.
  - `DatiSito = { generatoAlle, oggi: { data, disponibile: boolean, giornata|null }, bankroll: <statoBankroll>, storico: { righe, riepiloghi: { fatte: {sport,tipo,mercato,quotaDaVerificare}, proposte: {…} }, andamento: {data, bankroll}[] }, segnature: Segnatura[], erroriDati: { file, errore }[] }`.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
test('roi = profitto / somma puntate', ...);
test('vista proposte include anche le giocate non giocate; vista fatte solo quelle segnate fatte', ...);
test('annullate e senza esito escluse dai riepiloghi', ...);
test('costruisciDati con cartella temporanea: oggi.disponibile false se manca il file di oggi', ...);
test('costruisciDati: se la giornata non ha "giocate", applica selezionaGiocate ai candidati con lo stato bankroll corrente', ...);
test('andamento: un punto per giorno con giocate chiuse', ...);
```

- [ ] **Step 2: Esegui** `node --test test/storico test/build`. Atteso: FAIL.

- [ ] **Step 3: Implementa `riepiloga` e `costruisciDati`.** "Oggi" è la data di Roma di `adesso`. Fino alle 08:00 vale la giornata del giorno prima (le partite NBA notturne ne fanno parte), quindi prima delle 08:00 `oggi` punta a ieri.

- [ ] **Step 4: Esegui i test.** Atteso: PASS. Poi `npm run build` scrive `site/dati.json` dall'esempio.

- [ ] **Step 5: Commit** `feat: storico e build dei dati del sito`.

### Task 5: Pagina del giorno (layout A)

**Files:**
- Create: `site/index.html`, `site/app.js`, `site/stile.css`, `site/robots.txt`
- Test: `test/site/app.test.js` (solo funzioni pure esportate da `app.js`)

**Interfaces:**
- Consumes: `site/dati.json` (`DatiSito`).
- Produces: in `site/app.js` le funzioni pure esportate `filtraPerSport(giocate, sport|null)`, `etichettaStato(giocata): { testo, classe }`, `testoAvvisi(dati): string[]`; la pagina le usa nel browser.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
test('etichetta stato', () => {
  assert.equal(etichettaStato({ stato: 'in_attesa' }).testo, 'In attesa formazioni');
  assert.equal(etichettaStato({ stato: 'annullata', motivoStato: 'out Leão' }).testo, 'Annullata: out Leão');
});
test('avviso se oggi non disponibile', () =>
  assert.ok(testoAvvisi({ oggi: { disponibile: false }, bankroll: {...} }).includes('Analisi di oggi non disponibile')));
test('avviso stop settimanale raggiunto', ...);
test('avviso giocate da segnare', ...);
test('avviso competizioni non coperte e errori del giro', ...);
test('nessuna giocata con value: "Oggi nessuna giocata con value"', ...);
```

- [ ] **Step 2: Esegui** `node --test test/site`. Atteso: FAIL.

- [ ] **Step 3: Implementa la pagina.** Elementi in alto: filtri sport (Tutti, Calcio, Tennis, NBA, Basket, Pallavolo); riquadro con bankroll, risultato settimana, distanza dallo stop, in gioco oggi / tetto; avvisi. Poi una scheda per giocata, come nel §9.1 del documento: partita, orario (formato `HH:mm`, ora di Roma), competizione, tipo e mercato, quota con fonte e orario oppure l'etichetta "quota da verificare su bet365", quota minima, probabilità, value, puntata in € e %, stato con orario dell'ultimo controllo. Un `<details>` contiene il ragionamento (e le gambe per le multiple). Le annullate sono barrate. Layout a colonna singola sotto i 600px. Pagina `noindex`, link allo storico.

- [ ] **Step 4: Esegui i test.** Atteso: PASS. Poi verifica a mano: `npm run build` e apertura di `site/index.html` con un server statico (`node --run` di uno script `serve` minimale con `node:http`, da aggiungere a `package.json`), anche a 375px di larghezza.

- [ ] **Step 5: Commit** `feat: pagina del giorno`.

### Task 6: Pulsante "Giocata" e pagina storico

**Files:**
- Create: `site/giocata.js`, `site/storico.html`, `site/storico.js`
- Modify: `site/app.js` (aggiunge il pulsante alle schede)
- Test: `test/site/giocata.test.js`

**Interfaces:**
- Consumes: `DatiSito`.
- Produces: `costruisciSegnatura({ idGiocata, fatta, quotaReale, puntataReale }, adesso): Segnatura`; `percorsoSegnatura(idGiocata): string` (`data/segnature/<id codificato>.json`, `+` e caratteri non sicuri sostituiti con `_`); `salvaSegnatura(segnatura, { repo, token, fetch })` e `cancellaSegnatura(idGiocata, { repo, token, fetch })`, che usano l'endpoint GitHub `PUT/DELETE /repos/{repo}/contents/{path}` leggendo prima lo `sha` se il file esiste.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
test('percorso sicuro per id di multipla', () =>
  assert.equal(percorsoSegnatura('M-a+b'), 'data/segnature/M-a_b.json'));
test('quota reale obbligatoria e > 1 se fatta', ...);
test('salvaSegnatura: file esistente → PUT con sha', ...);   // fetch finto che registra le chiamate
test('salvaSegnatura: file nuovo → PUT senza sha', ...);
test('cancellaSegnatura → DELETE con sha', ...);
test('token mancante → errore "Codice segreto non impostato"', ...);
```

- [ ] **Step 2: Esegui** `node --test test/site/giocata.test.js`. Atteso: FAIL.

- [ ] **Step 3: Implementa `giocata.js`.** Il token (un fine-grained token GitHub con permesso Contents read/write solo su questo repository) e il nome del repository si salvano in `localStorage`, la prima volta, da un piccolo modulo "Impostazioni" in fondo alla pagina; gli accessi a `localStorage` sono dentro `try/catch`. Sulla scheda ci sono i pulsanti "Giocata" (campi quota reale e puntata reale, precompilati) e "Saltata". Se esiste già una segnatura si mostra "Annulla segnatura". Dopo il salvataggio la scheda mostra "Salvata – aggiornamento della pagina in 1-2 minuti", perché il sito viene ripubblicato dalla Action.

- [ ] **Step 4: Implementa lo storico.** Bankroll attuale, andamento (grafico a linea in SVG semplice), interruttore fra le viste "Giocate fatte" e "Tutte le proposte", tabelle di riepilogo per sport, tipo, mercato e quota verificata/da verificare, elenco delle giocate passate con esito e profitto.

- [ ] **Step 5: Esegui i test.** Atteso: PASS. Verifica a mano lo storico con dati d'esempio che hanno esiti.

- [ ] **Step 6: Commit** `feat: pulsante Giocata e storico`.

### Task 7: Pubblicazione su GitHub Pages

**Files:**
- Create: `.github/workflows/pubblica.yml`, `README.md`

**Interfaces:**
- Consumes: `npm test`, `npm run build`.

- [ ] **Step 1: Scrivi la workflow.** Si attiva a ogni push su `main` e a mano (`workflow_dispatch`). Esegue `actions/checkout`, `actions/setup-node` con Node 24, `npm test`, `npm run build`, poi `actions/upload-pages-artifact` con `site/` e `actions/deploy-pages`. Permessi `pages: write`, `id-token: write`, `contents: read`. Un solo deploy alla volta: `concurrency: { group: pages, cancel-in-progress: false }`.

- [ ] **Step 2: README in italiano.** Spiega come creare il token fine-grained (solo questo repository, permesso Contents read/write), dove inserirlo nella pagina, e che il repository e il sito sono pubblici.

- [ ] **Step 3: Azioni dell'utente** (da chiedere all'utente, l'agente non può farle): creare su GitHub un repository con un nome poco prevedibile (per esempio `analisi-` seguito da 6 caratteri casuali), attivare Pages con sorgente "GitHub Actions", creare il token. Poi l'agente aggiunge il remote e fa push.

- [ ] **Step 4: Verifica.** La Action termina in verde; il sito pubblicato mostra la giornata d'esempio; da telefono, "Giocata" su una scheda crea il file in `data/segnature/` e dopo la ripubblicazione il bankroll si aggiorna; "Annulla segnatura" lo riporta al valore precedente.

- [ ] **Step 5: Commit** `ci: pubblicazione su GitHub Pages`.
