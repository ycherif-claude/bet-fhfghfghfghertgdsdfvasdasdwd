# Fase 4a – NBA: dati, modello e giro del mattino

*Data: 20 ottobre 2026 · Stato: bozza da approvare*

Estende la Fase 2 (`docs/superpowers/specs/2026-10-19-fase-2-calcio-design.md`) a un secondo sport. Valgono tutte le regole della Fase 2 salvo dove questo documento dice altro: probabilità, correzioni dalle notizie (±8 punti), scrittura protetta della giornata, riserva ed esiti.

Legenda: **[utente]** = deciso dall'utente; **[scelta di Claude]** = deciso da Claude, modificabile.

Ordine dei prossimi lavori **[utente]**: NBA (questo documento), poi tennis, basket europeo, pallavolo e infine la Fase 3 (controlli prima delle partite).

## 1. Scopo

Ogni giorno, nella stessa giornata del sito (dalle 08:00 alle 08:00), compaiono anche le partite NBA della notte con giocate di value, calcolate e scelte con le stesse regole del calcio. L'utente non ha mai giocato l'NBA: le schede devono spiegare il mercato in parole semplici.

## 2. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- Mercati: **vincente** (supplementari compresi), **handicap** (spread) e **totale punti** della partita, supplementari compresi, come li conta bet365 per l'NBA. **[scelta di Claude, confermata dall'utente]**
- Fonti gratuite: **balldontlie** per palinsesto, risultati ed esiti; **SportsGameOdds** per le quote NBA. **[utente: "usiamoli tutti e due"]**
- Le giocate NBA entrano nello stesso file della giornata, con `sport: "nba"`, e passano per lo stesso `selezionaGiocate`. Tetti, stop e bankroll restano comuni a tutti gli sport.

**Non-obiettivi**
- **Giocate sui singoli giocatori** (punti, rimbalzi, assist). **[utente]**
- Mercati per quarto o per tempo, e totali per squadra (per ora). **[scelta di Claude]**
- Playoff con regole diverse: si useranno le stesse finché lo storico non dice altro.

**Anti-obiettivi**
- Consumare i crediti di The Odds API per l'NBA: quelli restano al calcio e agli sport successivi.
- Giocate NBA a inizio stagione basate su un modello senza dati, presentate come affidabili.
- Errori silenziosi, come in Fase 2.

## 3. Architettura

Si riusa lo schema della Fase 2.

```
05:35 UTC  raccolta.yml: calcio (come oggi) + NBA → data/raccolta/AAAA-MM-GG-nba.json, ed esiti NBA dei giorni prima
07:07 UTC  routine Claude: notizie di calcio e NBA (report infortuni ufficiale NBA) → un solo file notizie
09:45 UTC  riserva: come oggi
sera       giro serale NBA (Claude): ricontrolla infortuni e quote delle partite NBA della notte
```

### 3.1 Giro serale NBA [utente: "alle 22, e se ci sono partite prima, quel giorno prima"]
- **Orario:** di norma alle **22:00 di Roma**. Se quel giorno c'è una partita NBA che inizia prima delle 22:30, il giro si anticipa a **60 minuti prima della prima partita** (mai prima delle 14:00). **[dettagli: scelta di Claude]**
- **Come parte:** una GitHub Action (`serale-nba.yml`) gira ogni ora dalle 12:20 alle 21:20 UTC. Ogni volta calcola l'orario del giro serale dalla giornata di oggi. Quando quell'ora è arrivata, e il giro di oggi non è ancora stato fatto, avvia la routine Claude "Giro serale NBA" con il suo indirizzo API (`/fire`). Il token della routine è nel secret `ROUTINE_SERALE_TOKEN`, che l'utente genera una volta su claude.ai. Così la routine gira **una sola volta al giorno** e solo se ci sono giocate NBA. **[scelta di Claude]**
  - Il cron di GitHub ha passi di un'ora e può ritardare: il giro parte entro circa un'ora dopo l'orario calcolato, mai prima. Per anticipare davvero di 60 minuti, la Action lo avvia già al passaggio orario precedente all'orario calcolato.
- **Cosa fa Claude:** per ogni giocata NBA della giornata non ancora iniziata, legge il report infortuni più recente e le quote aggiornate (una chiamata a SportsGameOdds, nessun credito di The Odds API). Poi scrive `data/raccolta/AAAA-MM-GG-serale-nba.json` con una decisione per giocata: `confermata`, `modificata` (nuova quota minima, se la probabilità corretta cambia) oppure `annullata`, sempre con il motivo e la fonte. Infine `npm run serale-nba` applica le decisioni.
- **Cosa cambia nel file della giornata:** solo i campi `stato`, `motivoStato`, `oraUltimoControllo` e, per `modificata`, `quotaMinima` e `prob` delle giocate NBA (i valori del Modello dati della Fase 1). Le puntate non cambiano, né si aggiungono giocate: il giro serale **non** chiama `selezionaGiocate`. Questa regola vale anche per le giocate già segnate dall'utente. Per quelle, `annullata` compare come avviso, perché la giocata è già stata fatta. **[scelta di Claude]**
- **Se il giro serale non parte o fallisce,** le giocate restano "In attesa formazioni", con il motivo "controllo serale non eseguito" scritto dalla Action dopo l'orario previsto più due ore.
- **Partite iniziate prima del giro serale:** restano con il solo controllo del mattino, e la scheda lo dice.

- **Raccolta per sport [scelta di Claude]:** il calcio continua a scrivere `data/raccolta/AAAA-MM-GG.json`, l'NBA scrive `data/raccolta/AAAA-MM-GG-nba.json` con lo stesso formato (campo `sport` in ogni partita). Un errore della raccolta NBA non blocca quella del calcio, e viceversa: ognuno scrive i suoi errori.
- **Il giro legge tutte le raccolte del giorno** e costruisce i candidati di tutti gli sport. Poi chiama una sola volta `selezionaGiocate` sull'insieme. Così il tetto di 10 singole al giorno, il tetto giornaliero e lo stop restano comuni.
- **Notizie:** lo stesso file `data/raccolta/AAAA-MM-GG-notizie.json`; le correzioni e le esclusioni NBA usano gli `idPartita` NBA. Le istruzioni della routine aggiungono la parte NBA.
- **Chiavi nuove** (l'utente le crea, gratuite): `BALLDONTLIE_API_KEY` e `SPORTSGAMEODDS_API_KEY`, nei secrets del repository. Senza chiavi l'NBA si salta con un errore visibile; il calcio va avanti.

## 4. Fonti

| Dato | Fonte | Note (da verificare con la chiave reale) |
|---|---|---|
| Palinsesto e risultati | balldontlie, `GET /v1/games?dates[]=…` e `?seasons[]=…` | Piano gratuito: circa 5 richieste al minuto, chiave nell'intestazione `Authorization`. Lo storico di una stagione sono circa 13 pagine da 100 partite. Lo script resta sotto il limite: attesa di 13 secondi tra le richieste. |
| Quote | SportsGameOdds, `GET /v2/events?leagueID=NBA&oddsAvailable=true` | Piano gratuito "Amateur": 2.500 oggetti al mese (1 oggetto = 1 partita con tutte le quote), 10 richieste al minuto, aggiornamento ogni 10 minuti. Bookmaker americani (FanDuel, DraftKings, BetMGM, Caesars…), **senza Pinnacle né bet365**. Circa 10 partite al giorno, quindi circa 300 oggetti al mese. |
| Infortuni | Ricerca web di Claude sul report ufficiale NBA e sui siti delle squadre | Il report infortuni di balldontlie è a pagamento. |

**Nomi delle squadre:** le 30 squadre NBA hanno nomi stabili. Si usa una tabella fissa con abbreviazione e nome completo, e si abbinano le due fonti per abbreviazione. Una squadra non riconosciuta va in `erroriGiro`. **[scelta di Claude]**

**Termini d'uso:** si rispettano i limiti di richieste, nessuno scraping.

## 5. Modello

### 5.1 Forza delle squadre
- Per ogni squadra si stimano attacco e difesa in punti, con lo stesso metodo moltiplicativo del calcio applicato ai punti segnati e subiti, più il fattore campo. Pesi temporali con mezza vita di circa **30 giorni**: l'NBA cambia in fretta. **[scelta di Claude]**
- **Inizio stagione [scelta di Claude]:** si usa anche la stagione precedente. A ogni nuova stagione i valori di ogni squadra si riportano per un terzo verso la media, per i cambi di rosa. Finché una squadra ha meno di 10 partite nella stagione in corso, il peso del modello nella media con il mercato scende da 0,5 a 0,25.
- **Stanchezza:** seconda partita in due sere (back-to-back), −1,5 punti di margine atteso per quella squadra. **[scelta di Claude]**

### 5.2 Dalle forze alle probabilità
- Si calcolano i punti attesi delle due squadre, da cui il margine atteso e il totale atteso.
- Il margine e il totale seguono una distribuzione normale. Le deviazioni standard si stimano dai residui delle ultime due stagioni; il valore di partenza è circa 12,5 per il margine e 18 per il totale.
- Vincente: P(margine > 0), con i supplementari già compresi nel calcolo come "nessun pareggio". Handicap e totale: probabilità di superare la linea. Le linee intere possono finire in parità (rimborso): si usa la stessa probabilità condizionata del calcio.

### 5.3 Confronto con il mercato
- **Peso del modello per partita:** la raccolta scrive per ogni partita NBA `pesoModello` (0,5, oppure 0,25 se **almeno una** delle due squadre ha meno di 10 partite nella stagione in corso). Il giro lo usa al posto della costante del calcio; se il campo manca vale 0,5. Le correzioni dalle notizie e il controllo dei 10 punti restano sulla probabilità del modello, come nel calcio. **[scelta di Claude]**
- Al posto di Pinnacle si usa il **consenso senza margine** dei bookmaker americani di SportsGameOdds: per ogni bookmaker si toglie il margine, poi si fa la media tra i bookmaker. **[scelta di Claude]** Nel file di raccolta finisce nel campo `probPinnacle`, per non cambiare il giro; la scheda dice "Consenso bookmaker" invece di "Pinnacle".
- Media 50/50 tra modello e consenso (0,75/0,25 a inizio stagione, §5.1), e scarto massimo di 10 punti come nel calcio.
- **Quota per il value:** mediana dei bookmaker, minimo 3, per la **stessa linea**. Se i bookmaker hanno linee diverse, si usa la linea più comune e si ignorano le altre. **[scelta di Claude]**
- **Linea su bet365:** la linea di bet365 può essere diversa. Ogni scheda di handicap e totale ha la riga "Gioca solo con la stessa linea (<linea>) e quota almeno <quota minima>; con una linea diversa il calcolo non vale". **[scelta di Claude]**

### 5.4 Nomi dei mercati NBA (valori esatti)

| mercato | selezione | correggibile |
|---|---|---|
| `Vincente` | nome della squadra (es. `Boston Celtics`) | sì |
| `Handicap <linea>` (linea riferita alla squadra di casa, es. `Handicap -4.5`) | `casa`, `trasferta` | sì |
| `Totale punti <linea>` (es. `Totale punti 221.5`) | `Over 221.5`, `Under 221.5` | sì |

Nessun mercato NBA va nel percorso "senza quota": tutti hanno quote gratuite.

### 5.5 Ragionamento sulla scheda
Tre o quattro righe in italiano, per esempio:
- "Punti attesi: Celtics 116 – Knicks 110 (stagione in corso e precedente)"
- "Knicks alla seconda partita in due sere"
- "Modello 61%, consenso bookmaker 57%, probabilità usata 59%"
- La riga sulle notizie, come nel calcio.

Una riga di spiegazione del mercato per chi non conosce l'NBA, per esempio: "Handicap -4.5: vince se i Celtics vincono con almeno 5 punti di scarto, supplementari compresi". **[scelta di Claude]**

## 6. Esiti
- Da balldontlie: punteggio finale con i supplementari. Vincente, handicap e totale si chiudono sul finale. Una linea intera pari al risultato è un rimborso.
- Si usa la stessa logica della Fase 2: si aggiorna solo il campo `esito`, mai un esito inventato, e un avviso compare se una giocata resta senza esito per 7 giorni.

## 7. Routine
- Le istruzioni in `docs/routine/giro-del-mattino.md` aggiungono una sezione NBA.
  - Controllare il report infortuni ufficiale più recente e le notizie delle squadre.
  - Un titolare fuori va corretto o escluso. Lo stato "questionable" non è un fatto: non si corregge, ma si scrive nel ragionamento.
- Il tetto di ricerche web per l'intero giro passa da circa 15 a circa 20, per restare nei consumi del piano Pro. **[scelta di Claude]**

## 8. Collaudo
- Le chiavi `BALLDONTLIE_API_KEY` e `SPORTSGAMEODDS_API_KEY` le crea l'utente. Lo sviluppo procede con dati di prova; prima di attivare l'NBA si fa un collaudo con le chiavi vere.
- **Se il piano gratuito di SportsGameOdds non dà almeno 3 bookmaker per partita**, o non copre l'NBA, l'NBA resta spenta, con un errore visibile, finché non si trova un'altra fonte gratuita. Non si usa The Odds API per l'NBA.
- A inizio stagione (ottobre 2026) il modello si basa soprattutto sulla stagione precedente, con il peso ridotto del §5.1: è accettato.

## 9. Rischi
- **Inizio stagione:** con poche partite il modello è debole. La riduzione del peso (§5.1) e lo scarto massimo dal mercato limitano il danno.
- **Niente Pinnacle:** il consenso dei bookmaker americani è meno preciso di Pinnacle come riferimento.
- **Limiti dei piani gratuiti** di balldontlie e SportsGameOdds: da verificare con le chiavi vere prima di contarci.

## 10. Lasciato al builder
- Struttura dei moduli (per esempio `src/nba/`). Si condivide con `src/calcio/` ciò che è già generico (testo, http, normalizzazione) senza rompere i test della Fase 2.
- Formato esatto delle risposte delle due API, preso dalla loro documentazione.
- Come generalizzare il giro per leggere più raccolte, senza cambiare il comportamento sul calcio.
