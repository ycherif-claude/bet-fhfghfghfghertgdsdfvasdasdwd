# Revisione settimanale: 19–25 ottobre 2026

Rapporto scritto lunedì 26 ottobre 2026. Dati: `site/dati.json` della build di oggi, registro dei pronostici e file di raccolta. Le settimane prima del 19/10 non esistono: il sistema è partito il 20/10, quindi non c'è nessun confronto con le 4 settimane precedenti e il "totale dall'inizio" coincide con la settimana.

## 1. In breve
Il sistema è quasi tutto in **modalità prova**: 160 giocate su 162 sono di prova e solo 1 è stata giocata davvero (persa, −2 €; il bankroll è passato da 200 € a 198 €). Sulle 84 proposte chiuse (qualità del metodo) il risultato è quasi pari: 29 vinte, 53 perse, 2 rimborsate, −4,32 € (ROI −5,0%). I pronostici sì/no escono più spesso di quanto promesso (87,4% contro 85,6%), ma nessun pronostico è ancora ✅ "giocabile". Preoccupano le probabilità stimate dal modello, troppo ottimiste sotto il 50%, e le giocate "speciali" e 1X2, che perdono. Propongo di tenere d'occhio questi punti e di sistemare l'avvio del giro di Claude e alcuni nomi non riconosciuti. Il campione è molto piccolo (una settimana): per ora non si può concludere nulla di solido.

*ROI = rendimento: quanto si guadagna o si perde per ogni euro puntato (−5% vuol dire 5 centesimi persi per ogni euro).*

## 2. Numeri della settimana

| | Giocate fatte davvero | Tutte le proposte (chiuse) |
|---|---|---|
| Giocate chiuse | 1 | 84 |
| Vinte / perse / rimborsate | 0 / 1 / 0 | 29 / 53 / 2 |
| Profitto | −2,00 € | −4,32 € |
| ROI | −100% (1 sola giocata) | −5,0% |
| Ancora aperte | 0 | 34 (partite dal 23 al 27/10) |

- **Bankroll** (il capitale di gioco): 200 € a inizio settimana, 198 € a fine settimana.
- Le proposte contano solo quelle non annullate; le annullate (prima di giocare) sono 40 (2 sono del 26/10, fuori settimana).
- Nel totale dall'inizio i numeri sono gli stessi della settimana (solo 3 giocate chiuse in più della sera del 26/10 non ci sono ancora).

**Tetto giornaliero** (12% del bankroll ≈ 23,76 €):
- Puntate ridotte dal tetto (caso B): **0**.
- Giornate piene (caso C, con puntata fissa da 1 €): **3** (23, 24 e 25 ottobre), con **92 puntate fisse** in tutto (8 il 23, 50 il 24, 34 il 25). Il 24/10 si sono messi in gioco 50 € (circa il 25% del bankroll), il 25/10 34 €, cioè più del tetto: è la regola dei casi pieni, ma è tutto "in prova".
- Le 78 puntate fisse chiuse rendono +1,51 € (ROI +1,9%; 28 vinte, 48 perse, 2 rimborsate). Le 6 giocate con puntata normale (Kelly, cioè calcolata sul bankroll) rendono −5,83 € (ROI −64,8%; 1 vinta su 6). Il campione è troppo piccolo.
- Motivi "stop settimanale" o "puntata ridotta sotto il minimo" (vecchie regole): nessuno.

## 3. Cosa funziona e cosa no
Con meno di 20 giocate in un gruppo il campione è troppo piccolo per concludere qualcosa. Vista "tutte le proposte":

**Per sport**
- Calcio: 77 chiuse, 28 vinte, +0,51 € (ROI +0,7%). È l'unico sport con numeri sufficienti: sostanzialmente in pari.
- Tennis (2), NBA (1), basket (2), multiple miste (2): campione troppo piccolo.

**Per tipo**
- Singole: 57, −5,68 € (ROI −9,4%).
- Speciali: 20, solo 3 vinte, −9,30 € (ROI −46,5%). Campione al limite, ma è il gruppo che perde di più.
- Multiple: 7, 3 vinte, +10,66 € (ROI +164%). Campione troppo piccolo: una sola multipla lunga che vince basta a spiegarlo.

**Per mercato** (solo quelli con almeno 10 giocate)
- 1X2 (vittoria/pareggio/sconfitta): 23, 6 vinte, −5,31 € (ROI −23,1%).
- Doppia chance: 13, 6 vinte, −0,42 € (ROI −3,2%).
- Under/Over 2,5 gol: 19, 9 vinte, +1,56 € (ROI +8,2%).
- Under/Over 3,5 gol: 10, 3 vinte, −2,48 € (ROI −24,8%, campione piccolo).

**Calibrazione** (*confronto tra la probabilità stimata dal modello e la percentuale di vincita reale; escluse multiple e rimborsate*)

| Fascia stimata | Giocate | Vinte davvero | Stimata in media |
|---|---|---|---|
| 20–30% | 10 | 10,0% | 26,8% |
| 30–40% | 19 | 26,3% | 36,3% |
| 40–50% | 28 | 39,3% | 45,9% |
| 50–60% | 16 | 56,3% | 54,4% |
| 60–70% | 2 | 0% | 61,1% |

Il modello è **troppo ottimista sotto il 50%** (di circa 7-9 punti) e ben centrato sopra il 50%. Con 75 giocate in tutto e fasce da 2 a 28 giocate, è solo un indizio.

**Quota "da verificare su bet365"** (quota non gratuita, da controllare a mano): 7 chiuse, 2 vinte, +0,89 € (ROI +9,9%). Quelle con quota gratuita: 77, −5,21 € (ROI −6,7%). Campione troppo piccolo per dire se vanno meglio.

**Correzioni dalle notizie**: nessuna giocata della settimana ha una correzione dalle notizie, quindi non c'è nulla da confrontare.

**Quote prese davvero**: c'è una sola segnatura fatta (Levante–Athletic Bilbao, cartellini Under 3,5, 21/10): quota presa 2,65, contro la minima 2,35, quindi **sopra** la minima. Il bookmaker non è indicato (segnatura precedente al campo) e non c'era una quota gratuita da confrontare. Persa. Un'altra giocata (Wolverhampton–Portsmouth, 20/10) è stata segnata come *non fatta*. Non si può dire nulla su bookmaker o differenze di quota.

**Giocate annullate prima di giocare**: 40. 34 sono state fermate dalla "regola automatica" (Claude non disponibile) perché la quota era scesa sotto la minima: 7 sarebbero state vinte e 27 perse. Le altre 6 sono state fermate da Claude (2 vinte, 2 perse, 2 rimborsate). Il filtro, in questa settimana, ha evitato più perdite che vincite.

## 4. Pronostici e doppie/triple
I pronostici sì/no (per esempio "più di 1,5 gol sì/no") sono stati registrati dal 22/10 al 25/10: 246 pronostici, di cui 206 chiusi e 40 ancora aperti.

- **Pronostici ✅ (giocabili)**: **zero**. In questa settimana nessun pronostico ha superato la soglia per essere ✅, quindi non si può dire se escano come promesso. Vale la pena capire se la soglia è troppo alta o se è un effetto dei primi giorni.
- **Migliori e tutti**:
  - Tutti: 180 giusti, 26 sbagliati (87,4%) contro 85,6% promesso (limite prudente 84,0%). Escono un po' più del promesso.
  - Migliori (il pronostico migliore di ogni partita): 98 giusti, 9 sbagliati (91,6%) contro 84,6% promesso (limite prudente 82,9%). Escono di più della media di tutti, come atteso.
- **Per partita**: 146 partite, di cui 105 con tutti i pronostici giusti, 18 con almeno uno sbagliato e 23 ancora aperte. Quando una partita va storta, di solito sbagliano più pronostici insieme.
- **Doppie e triple** (con 1 € per schedina, in prova): 9 schedine, 4 vinte, 1 persa, 4 aperte, profitto +1,07 € (rendimento +21,4%).
  - Doppie: 5 (1 vinta, 1 persa, 3 aperte), −0,50 € (−25%).
  - Triple: 4 (3 vinte, 1 aperta), +1,57 € (+52,3%).
  - Tutte e 9 usano quote "da verificare". Campione piccolissimo: la fortuna conta più del metodo.

## 5. Salute del sistema
- **Giorni senza giro di Claude**: 1 su 7 (25/10, giro di "riserva": senza notizie e senza controllo di Claude; le giocate annullate dalla regola automatica sono state 34 in totale nella settimana, non solo quel giorno).
- **Errori ricorrenti nelle giornate**:
  - Quote non trovate su odss-api per molte leghe (Bundesliga, 2. Bundesliga, Süper Lig, Liga Profesional, Liga MX, Grecia, Austria, Norvegia, Danimarca, MLS e altre), in 3 o più giorni: spesso si usa The Odds API, altrimenti si gioca senza quota.
  - Budget di richieste raggiunto (odss-api): 4 volte per i controlli prima delle partite e anche per NBL, pallavolo ed Eurolega. Le quote dei controlli vengono prese dalle fonti precedenti.
  - tennis-data.co.uk (storico WTA) con errore HTTP 403 il 20/10 (3 volte); TheSportsDB con errore 429 (troppe richieste) 3-4 volte.
  - 7 partite NBA con casa e trasferta invertite rispetto al calendario, ignorate (26/10, ripetuto 2 volte).
  - Mancano le chiavi NBA il 20/10 (una volta).
  - Squadre non riconosciute (tutte una volta sola): Vitória SC, SV Darmstadt 98, Stade Lavallois, Halmstads BK, Real Racing Club de Santander, Mainz 05, Celta Fortuna, Rennes, Sporting Lisbon, Goztepe, varie squadre di pallavolo e turche.
  - Competizioni scoperte: Champions League femminile (22/10) e Serie A1 femminile di pallavolo (24 e 25/10): senza storico gratuito.
- **Giocate senza esito da più di 7 giorni**: nessuna. Le 34 aperte sono partite dal 23 al 27/10.
- **Errori dati della build** (`erroriDati`): nessuno.
- **Crediti delle quote**: usati questa settimana circa 30 per il calcio, 18 per il basket, 21 per la pallavolo, 4 per il tennis (+2 serale); NBA con SportsGameOdds oggetti 0-12 al giorno. Il credito principale è passato da 484 a 321 richieste in 7 giorni (circa 23 al giorno); OddsPapi per la pallavolo è a 224 su 250 circa. Il mese di ottobre è quasi finito, quindi il ritmo è sostenibile. Per novembre, con lo stesso ritmo, i 500 di limite durerebbero circa 3 settimane: da controllare. Il file di stato odss indica 443 rimaste su 500 con reset il 21/11.

## 6. Proposte (in ordine di importanza)

1. **Non passare al gioco reale finché le proposte non sono in utile su un campione più grande.**
   - Perché: ROI proposte −5,0% su 84 giocate, quasi tutto in prova, e una sola giocata vera.
   - Sicurezza: bassa-media (una settimana).
   - Rischio a farlo: nessuno. Rischio a non farlo: giocare soldi veri con un metodo non ancora provato.

2. **Rivedere o togliere le giocate "speciali" e il mercato 1X2 se continuano così per altre 2-3 settimane.**
   - Perché: speciali 3 vinte su 20 (ROI −46,5%), 1X2 6 vinte su 23 (ROI −23,1%); la calibrazione mostra stime troppo alte sotto il 50%.
   - Sicurezza: bassa (20-23 giocate, il minimo accettabile).
   - Rischio a farlo: perdere qualche giocata che andrebbe bene; a non farlo: continuare a perdere sempre sugli stessi mercati. Meglio aspettare circa un mese (documento di progetto §7.3).

3. **Rivedere le stime di probabilità sotto il 50%** (ridurle di qualche punto).
   - Perché: stimate 27%, 36% e 46% nelle tre fasce basse, vinte davvero 10%, 26% e 39%.
   - Sicurezza: media-bassa (75 giocate in tutto).
   - Rischio a farlo: perdere un po' di giocate valide; a non farlo: puntate su giocate che non hanno il vantaggio che sembra.

4. **Capire perché nessun pronostico è ✅ e perché il 25/10 il giro di Claude non c'è stato.**
   - Perché: 0 pronostici giocabili su 246; la regola automatica ha annullato 34 giocate quando Claude non era disponibile.
   - Sicurezza: alta sul fatto, da chiarire la causa.
   - Rischio a farlo: nessuno (solo controllo). A non farlo: restare senza pronostici utili e senza notizie in certi giorni.

5. **Sistemare i nomi non riconosciuti ricorrenti e il limite di richieste.**
   - Perché: squadre come Mainz 05, Rennes, Sporting Lisbon, Santander e molte quote non trovate su odss-api; il budget dei controlli (3 al giorno) è sempre raggiunto.
   - Sicurezza: media. Rischio a farlo: basso; a non farlo: partite scartate o senza quota.

Nessun modello garantisce vincite, e su poche settimane la fortuna pesa più del metodo.
