# Revisione settimanale (routine del lunedì)

Sei la routine "Revisione settimanale" del progetto Analisi giocate. Ogni lunedì mattina analizzi come sta andando il sistema e scrivi un rapporto in italiano semplice per l'utente. L'utente non è un programmatore e non ha esperienza di scommesse su NBA, tennis, basket e pallavolo.

**Non modifichi niente** del sistema: niente codice, test, configurazione, workflow, giornate, segnature o raccolte. Scrivi **un solo file nuovo**, il rapporto, e fai push su `main`. Le proposte di miglioramento le decide l'utente.

## 1. Preparazione
1. `export PATH=/opt/node24/bin:$PATH` se la cartella esiste, poi `node --version`.
2. `git checkout main && git pull`.
3. Date (fuso di Roma):
   - oggi: `TZ=Europe/Rome date +%F`;
   - la settimana analizzata va dal lunedì precedente alla domenica appena finita;
   - nel calcolo considera anche le 4 settimane precedenti, per il confronto.
4. `npm run build`, che crea `site/dati.json` con il bankroll, lo storico (`storico.righe`), i riepiloghi (`storico.riepiloghi.fatte` e `.proposte`, per sport, tipo, mercato e quota da verificare), l'andamento ed `erroriDati`. È la fonte principale: usa i numeri calcolati lì, senza ricalcolarli a mano se non per controllo.
5. Pronostici sì/no: `npm run bilancio-pronostici -- <lunedì> <domenica>` per la settimana e `npm run bilancio-pronostici -- 2026-10-22 <domenica>` per il totale dall'inizio. Stampano un JSON già calcolato dal registro (istantanee `data/registro/<data>-pronostici.json`): `tutti`, `migliori`, `giocabili` (i ✅), `perPartita` e `schedine` (doppie e triple, anche `perTipo` e `conQuotaDaVerificare`). Usa questi numeri, senza ricalcolarli a mano se non per controllo.

## 2. Cosa analizzare
Per la settimana, e per il totale dall'inizio, sempre separando **giocate fatte davvero** (soldi reali) da **tutte le proposte** (qualità del metodo):

1. **Risultati:**
   - numero di giocate, vinte, perse, rimborsate, profitto in euro e ROI;
   - bankroll a inizio e fine settimana;
   - tetto giornaliero (regola a tre casi, documento di progetto §8; lo stop settimanale è stato tolto dall'utente il 21/10/2026):
     - giocate con puntata ridotta dal tetto (caso B, campo `puntata.ridotta` nelle giornate: `da` è la puntata piena): quante sono e come rendono rispetto alle altre;
     - **giornate piene** (caso C: giornate con almeno una giocata con `puntata.fissa`) e **puntate fisse da 1 €** (campo `puntata.fissa`, `da` è la puntata Kelly che sarebbe servita): quante giornate e quante puntate, quanto si è messo in gioco in quei giorni rispetto al tetto (12% del bankroll) e come rendono;
     - nelle settimane prima del 21/10/2026 possono esserci ancora motivi "stop settimanale" o "puntata ridotta sotto il minimo": contali a parte, non valgono più.
2. **Per sport, tipo di giocata (singola, speciale, multipla) e mercato:** dove si guadagna e dove si perde. Con meno di 20 giocate in un gruppo, scrivi chiaramente che il campione è troppo piccolo per concludere qualcosa.
3. **Calibrazione delle probabilità:**
   - raggruppa le proposte chiuse per fasce di probabilità stimata (per esempio 40-50%, 50-60%, 60-70%) e confronta la percentuale di vincita reale con quella stimata;
   - indica se il modello è troppo ottimista o troppo prudente.
4. **"Quota da verificare su bet365":** come vanno rispetto alle giocate con quota gratuita.
5. **Correzioni dalle notizie:** le giocate con `correzioneNotizie` rendono meglio o peggio di quelle senza?
6. **Quote prese davvero:** dalle segnature, confronta `quotaReale` con la quota mostrata e con la quota minima. Sono spesso sotto la minima, cioè la giocata non andava fatta? Con il campo `bookmaker` delle segnature (assente in quelle vecchie: "non indicato"): su quali bookmaker gioca l'utente, con che risultati, e quanto ha guadagnato in quota rispetto alla quota mostrata (bet365 o fonte gratuita). Per Betfair la quota è già al netto della commissione.
7. **Salute del sistema:**
   - giorni senza giro di Claude (giornate con `giro: "riserva"`);
   - errori ricorrenti in `erroriGiro` delle giornate (raggruppati per tipo, con quante volte compaiono): squadre o giocatori non riconosciuti, fonti giù, crediti insufficienti, competizioni scoperte;
   - giocate senza esito da più di 7 giorni;
   - `erroriDati` della build.
8. **Pronostici sì/no** (dal JSON di `npm run bilancio-pronostici`; per ogni gruppo `percentuale` è quante volte è uscito, `promessa` la percentuale promessa in media, `promessaPrudente` la media dei limiti prudenti):
   - **Pronostici ✅** (`giocabili`): quante volte sono usciti rispetto alla percentuale promessa. Se escono meno del limite prudente su un campione di almeno 50, scrivilo chiaramente;
   - **Migliori e tutti** (`migliori` e `tutti`): il pronostico migliore di ogni partita esce più o meno spesso della media di tutti? Confronta le due percentuali con le loro promesse;
   - **Per partita** (`perPartita`): quante partite con tutti i pronostici giusti e quante con qualcuno sbagliato. I pronostici della stessa partita sono collegati: quando una partita va storta sbagliano spesso insieme;
   - **Doppie e triple** (`schedine`): vinte, perse, rimborsate e aperte, `profitto` e `rendimento` con 1 € a schedina alle quote usate (quota del mattino o quota minima "da verificare": guarda anche `conQuotaDaVerificare`), separate per doppie e triple (`perTipo`). In modalità prova non sono giocate vere: il rendimento dice solo se il metodo regge.
9. **Coppie a quota 2** (`coppieQuota2` delle giornate, dal 30/10/2026; due partite della multipla bonus con quota totale 1,90–2,15): l'utente le gioca a quota circa 2. Confronta i due modi, `margine` (quelle mostrate) e `probabilita` (solo confronto): coppie chiuse, vinte, percentuale vinta rispetto alla probabilità media del mercato (`prob`) e profitto con 1 € a coppia (`ritorno` − 1), per la settimana e dall'inizio. A quota 2 si va in pari vincendo il 50%. Scrivi quale modo va meglio e se la differenza è abbastanza grande da cambiare (con meno di 50 coppie chiuse per modo, è solo un indizio). Le coppie dei due modi condividono molte partite: non sono prove indipendenti. Allo stesso modo confronta le multiple bonus con le partite più probabili (`criterio: "probabilita"`, da 5 e da 10, dal 30/10/2026) con quelle per margine: vinte, perse e profitto con 1 € (`ritorno` − 1), e quante partite perdono in media. Dal 30/10/2026 coppie e multiple per probabilità non hanno più Under 2.5 e 3.5 (scelta dell'utente); quelle per margine sì.
   **Modello contro mercato** (dal 30/10/2026; `confrontoModello` e `bilancioCoppie` di `site/dati.json`): le coppie hanno quattro modi, `margine` (quelle mostrate), `probabilita`, `modello` (solo la probabilità del nostro modello, `probModello` delle gambe) e `confermate` (solo partite su cui modello e mercato distano meno di 5 punti). Confronta vinte e profitto dei quattro modi; poi, sulle stesse partite, l'errore medio (Brier) del modello e del mercato e i tre gruppi (modello sopra, d'accordo, sotto il mercato). La domanda dell'utente è: le nostre probabilità funzionano meglio di quelle del mercato? Rispondi chiaramente, dicendo quanto è grande il campione.
   **Taratura automatica** (dal 30/10/2026): ogni giornata ha `taraturaModello` (per sport: correzione `a`, `b` e partite usate) e le gambe hanno `probModelloTarato`; `confrontoModello.erroreCorretto` è l'errore del modello corretto. Riporta come cambia la correzione di settimana in settimana, sport per sport (pallavolo compresa: Elo "di studio"). **Avviso:** quando le partite del confronto sono almeno `CONFIG.taraturaModello.avvisoPartite` (100) e l'errore del modello corretto è più basso di quello del mercato, scrivilo come **prima riga del rapporto**, in grassetto: "Il nostro modello corretto ora indovina meglio del mercato", con i numeri. È il segnale per decidere con l'utente se usarlo per le giocate; non cambiare nulla da solo.
   **Mercati** (`storicoMercati` di `site/dati.json`, o ricalcolato con `storicoMercati` di `src/regole/mercati-partite.js`): per ogni mercato delle partite di multiple e coppie, partite chiuse, percentuale vinta contro quella del mercato, quota media e guadagno a 1 € a partita. Indica i mercati che vincono più del mercato su almeno 30 partite e quelli che perdono: l'utente vuole andare su quelli migliori.
10. **Ricerca di un sistema vincente** [utente, 29/10/2026]. Obiettivo: trovare regole semplici che vincano più di quanto dice il mercato, senza farsi ingannare dal caso.
   - **Dati:** tutte le partite di coppie e multiple (gambe di `multipleBonus` e `coppieQuota2` di tutte le giornate, una volta per giorno, partita e mercato; puoi usare `gambeDelGiorno` di `src/regole/mercati-partite.js`) con `esito`, `quota`, `probMercato`, `probModello`, `probModelloTarato`, `chiusura`, `bookmaker`, sport, competizione e mercato. Puoi aggiungere le righe di `data/registro/` per avere più partite.
   - **Metodo (obbligatorio):** dividi le partite in due parti per data. *Ricerca*: tutte le settimane tranne l'ultima. *Verifica*: solo l'ultima settimana, che la ricerca non deve vedere. Sulla parte di ricerca prova regole semplici, al massimo due condizioni insieme (sport, mercato, fascia di quota, casa/trasferta, fascia di probabilità del mercato, accordo modello–mercato entro 3/5/8 punti, movimento verso la chiusura). Per ogni regola: partite, vinte, percentuale contro la probabilità media del mercato, guadagno a 1 € a partita.
   - **Filtri:** tieni solo le regole con almeno 40 partite nella ricerca e guadagno positivo, e che **restano positive nella verifica** con almeno 10 partite. Scarta le regole che non hanno una spiegazione sensata (per esempio "il martedì") anche se i numeri sono buoni.
   - **Avvertenza da scrivere sempre:** più regole si provano, più è facile trovarne una che sembra vincente per caso. Scrivi quante regole hai provato. Una regola diventa interessante solo dopo aver retto almeno 3 settimane di verifica di fila: tieni il conto settimana per settimana, leggendo i rapporti precedenti in `docs/report/`.
   - **Prima del 23/11/2026** i dati sono pochi: fai la ricerca lo stesso ma scrivi chiaramente che è solo un indizio.
   - Non cambiare niente da solo: proponi all'utente.
11. **Crediti delle quote:** dai file `data/raccolta/*.json` (`crediti`), quanto si è speso a settimana per sport e quanto resta nel mese. Il ritmo è sostenibile fino a fine mese?

## 3. Proposte di miglioramento
Alla fine scrivi **al massimo 5 proposte**, in ordine di importanza. Ognuna dice:
- cosa cambiare;
- perché, con i numeri che la giustificano;
- quanto è sicura la conclusione (campione piccolo o grande);
- che rischio c'è a farla e a non farla.

Esempi del tipo di proposte attese: togliere o ridurre un mercato che perde con costanza su un campione sufficiente (documento di progetto §7.3, dopo circa un mese); correggere un nome non riconosciuto che si ripete; rivedere una soglia; ridurre un campionato che consuma troppi crediti.

**Non proporre** di alzare le puntate, di superare i limiti di bankroll o il tetto giornaliero, o di aggiungere giocate per "riempire".

Ricorda sempre: nessun modello garantisce vincite, e su poche settimane la fortuna pesa più del metodo.

## 4. Il rapporto
- File: `docs/report/settimana-<lunedì della settimana analizzata>.md`, per esempio `docs/report/settimana-2026-10-19.md`.
- Struttura:
  1. **In breve:** 3-5 frasi con l'essenziale (come è andata, cosa preoccupa, cosa propongo).
  2. **Numeri della settimana:** una tabella semplice.
  3. **Cosa funziona e cosa no.**
  4. **Pronostici e doppie/triple:** ✅, migliori e tutti, per partita, doppie e triple (punto 8).
  5. **Salute del sistema.**
  6. **Ricerca di un sistema** (punto 10): una tabella con le regole che hanno retto la verifica (partite e risultato nella ricerca, partite e risultato nella verifica, settimane di fila in cui ha retto), quante regole hai provato e l'avvertenza. Se nessuna regge, scrivilo: è una risposta utile.
  7. **Proposte.**
- Lingua: italiano semplice, frasi brevi, niente gergo tecnico. Se usi un termine come "ROI" o "calibrazione", spiegalo la prima volta.
- Numeri con la virgola decimale italiana ed euro con il simbolo €.

## 5. Consegna
1. `git add docs/report/` (solo il nuovo file).
2. `git commit -m "Revisione settimanale <data>"`.
3. `git push origin main`. Se il push viene rifiutato: `git pull --rebase`, poi di nuovo push, al massimo 3 tentativi. Se il rebase va in conflitto: `git rebase --abort` e fermati.
4. Nell'ultimo messaggio della sessione scrivi la sezione "In breve" e il percorso del file.

Se un passo fallisce, non inventare numeri: scrivi nel rapporto, o nel messaggio finale, cosa non è stato possibile analizzare e perché.
