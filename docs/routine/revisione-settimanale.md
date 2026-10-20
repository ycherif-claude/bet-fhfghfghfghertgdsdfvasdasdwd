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

## 2. Cosa analizzare
Per la settimana, e per il totale dall'inizio, sempre separando **giocate fatte davvero** (soldi reali) da **tutte le proposte** (qualità del metodo):

1. **Risultati:**
   - numero di giocate, vinte, perse, rimborsate, profitto in euro e ROI;
   - bankroll a inizio e fine settimana;
   - distanza minima dallo stop raggiunta.
2. **Per sport, tipo di giocata (singola, speciale, multipla) e mercato:** dove si guadagna e dove si perde. Con meno di 20 giocate in un gruppo, scrivi chiaramente che il campione è troppo piccolo per concludere qualcosa.
3. **Calibrazione delle probabilità:**
   - raggruppa le proposte chiuse per fasce di probabilità stimata (per esempio 40-50%, 50-60%, 60-70%) e confronta la percentuale di vincita reale con quella stimata;
   - indica se il modello è troppo ottimista o troppo prudente.
4. **"Quota da verificare su bet365":** come vanno rispetto alle giocate con quota gratuita.
5. **Correzioni dalle notizie:** le giocate con `correzioneNotizie` rendono meglio o peggio di quelle senza?
6. **Quote prese davvero:** dalle segnature, confronta `quotaReale` con la quota mostrata e con la quota minima. Sono spesso sotto la minima, cioè la giocata non andava fatta?
7. **Salute del sistema:**
   - giorni senza giro di Claude (giornate con `giro: "riserva"`);
   - errori ricorrenti in `erroriGiro` delle giornate (raggruppati per tipo, con quante volte compaiono): squadre o giocatori non riconosciuti, fonti giù, crediti insufficienti, competizioni scoperte;
   - giocate senza esito da più di 7 giorni;
   - `erroriDati` della build.
8. **Crediti delle quote:** dai file `data/raccolta/*.json` (`crediti`), quanto si è speso a settimana per sport e quanto resta nel mese. Il ritmo è sostenibile fino a fine mese?

## 3. Proposte di miglioramento
Alla fine scrivi **al massimo 5 proposte**, in ordine di importanza. Ognuna dice:
- cosa cambiare;
- perché, con i numeri che la giustificano;
- quanto è sicura la conclusione (campione piccolo o grande);
- che rischio c'è a farla e a non farla.

Esempi del tipo di proposte attese: togliere o ridurre un mercato che perde con costanza su un campione sufficiente (documento di progetto §7.3, dopo circa un mese); correggere un nome non riconosciuto che si ripete; rivedere una soglia; ridurre un campionato che consuma troppi crediti.

**Non proporre** di alzare le puntate, di superare i limiti di bankroll o di stop, o di aggiungere giocate per "riempire".

Ricorda sempre: nessun modello garantisce vincite, e su poche settimane la fortuna pesa più del metodo.

## 4. Il rapporto
- File: `docs/report/settimana-<lunedì della settimana analizzata>.md`, per esempio `docs/report/settimana-2026-10-19.md`.
- Struttura:
  1. **In breve:** 3-5 frasi con l'essenziale (come è andata, cosa preoccupa, cosa propongo).
  2. **Numeri della settimana:** una tabella semplice.
  3. **Cosa funziona e cosa no.**
  4. **Salute del sistema.**
  5. **Proposte.**
- Lingua: italiano semplice, frasi brevi, niente gergo tecnico. Se usi un termine come "ROI" o "calibrazione", spiegalo la prima volta.
- Numeri con la virgola decimale italiana ed euro con il simbolo €.

## 5. Consegna
1. `git add docs/report/` (solo il nuovo file).
2. `git commit -m "Revisione settimanale <data>"`.
3. `git push origin main`. Se il push viene rifiutato: `git pull --rebase`, poi di nuovo push, al massimo 3 tentativi. Se il rebase va in conflitto: `git rebase --abort` e fermati.
4. Nell'ultimo messaggio della sessione scrivi la sezione "In breve" e il percorso del file.

Se un passo fallisce, non inventare numeri: scrivi nel rapporto, o nel messaggio finale, cosa non è stato possibile analizzare e perché.
