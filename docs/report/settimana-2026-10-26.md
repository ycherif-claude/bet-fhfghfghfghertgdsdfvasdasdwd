# Revisione settimanale: 26 ottobre – 1 novembre 2026

Rapporto scritto lunedì 2 novembre 2026. Dati: `site/dati.json` della build di oggi, registro dei pronostici (`npm run bilancio-pronostici`), giornate, segnature e file di raccolta. La settimana precedente è quella del 19–25 ottobre (`settimana-2026-10-19.md`).

## 1. In breve
Questa settimana l'utente ha giocato davvero 4 giocate (2 coppie a quota 2 e 2 multiple bonus, tutte su bet365, 60 € in totale): una sola vinta, **−38,57 €**. Il bankroll (il capitale di gioco) è sceso da 198 € a 159,43 €. Tutto il resto del sistema è ancora "in prova": le 141 proposte chiuse sono quasi in pari (50 vinte, 90 perse, 1 rimborsata, −3,03 €, ROI −2,0%; il ROI è quanto si guadagna o perde per ogni euro puntato). Il nostro modello **non** indovina meglio del mercato (errore 0,219 contro 0,211 su 506 partite) e sotto il 50% è ancora troppo ottimista. La ricerca di un sistema vincente trova solo un indizio debole: i favoriti con probabilità del mercato tra 70% e 80% vincono più di quanto dice il mercato. Propongo di non cambiare le puntate e di aspettare altre settimane.

## 2. Numeri della settimana

| | Giocate fatte davvero | Tutte le proposte (chiuse) |
|---|---|---|
| Giocate chiuse | 4 | 141 |
| Vinte / perse / rimborsate | 1 / 3 / 0 | 50 / 90 / 1 |
| Profitto | −38,57 € | −3,03 € |
| ROI | −64,3% | −2,0% (su 150,30 € puntati) |
| Ancora aperte | 0 | 8 |

- **Bankroll:** 198 € a inizio settimana, 159,43 € a fine settimana (saldo dall'inizio dei conti, 29/10: −38,57 €).
- **Dall'inizio** (totale): giocate fatte 5 (1 vinta), −40,57 €; proposte chiuse 242 (87 vinte), −3,85 €, ROI −1,5%.
- **Le fatte davvero, una per una** (quota presa contro quota mostrata, tutte su bet365):
  - Multipla da 5 (probabilità): vinta, presa a 3,90 contro 3,83 mostrata;
  - Multipla da 10 (probabilità): persa (9 gambe su 10 giuste), presa a 15,35 contro 15,21;
  - Coppia a quota 2 del 30/10 (prima, 25 €): persa, presa a 2,08 contro 2,10;
  - Coppia a quota 2 del 30/10 (seconda, 25 €): persa, presa a 1,90 contro 1,95.
  Per le coppie la quota presa è stata un po' più bassa di quella mostrata; per le multiple un po' più alta. Il campione è di 4 giocate: la fortuna pesa più di tutto.
- Annullate prima di giocare: 80 proposte (27 sarebbero state vinte, 48 perse, 5 ancora aperte). 65 sono state fermate dalla "regola automatica" (Claude non disponibile per i controlli prima della partita) perché la quota era scesa sotto la minima; 15 da Claude per la stessa ragione. Il filtro ha evitato più perdite che vincite.

**Tetto giornaliero** (12% del bankroll, circa 19–24 €):
- Puntate ridotte dal tetto (caso B): **9** proposte chiuse, 5 vinte, +11,44 € su 18,30 € puntati (ROI +62,5%): campione piccolo, tutto il guadagno viene da poche giocate.
- **Giornate piene** (caso C): **7 giornate su 7**, con **132 puntate fisse da 1 €** chiuse (45 vinte, −14,47 €, ROI −11,0%). Messo in gioco ogni giorno: 12 € (26/10), 18 € (27/10), 16 € (28/10), 27,50 € (29/10), 14,80 € (30/10), 41 € (31/10), 29 € (1/11). Il 31/10 e il 1/11 si va ben oltre il tetto: è la regola dei casi pieni (puntate da 1 € fisse), ma tutto "in prova".
- Motivi vecchi ("stop settimanale" o "puntata ridotta sotto il minimo"): nessuno questa settimana.

## 3. Cosa funziona e cosa no
Con meno di 20 giocate in un gruppo il campione è troppo piccolo per concludere qualcosa. Vista "tutte le proposte", settimana:

**Per sport**
- Calcio: 103 chiuse, 31 vinte, −17,97 € (ROI −16,3%). Unico sport con campione grande, e perde.
- NBA: 15, 9 vinte, +1,55 € (+10,3%). Basket: 8, +2,32 €. Tennis: 7, 4 vinte, +8,52 €. Tutti sotto 20 giocate: campione troppo piccolo.

**Per tipo**
- Singole: 95, 40 vinte, −1,80 € (ROI −1,7%).
- Speciali: 32, solo 6 vinte, −8,47 € (ROI −26,5%). Dall'inizio: 57 speciali, 10 vinte, −18,72 € (ROI −32,8%): è il gruppo che perde con più costanza.
- Multiple: 14, 4 vinte, +7,24 €. Campione piccolo.

**Per mercato** (solo con almeno 10 giocate)
- 1X2: 42, 10 vinte, −7,71 € (ROI −17,3%). Dall'inizio: 74, 21 vinte, −8,08 € (−10,6%).
- Under/Over 2,5 gol: 21, 5 vinte, −11,36 € (ROI −49,0%). Dall'inizio: 43, 16 vinte, −7,88 €.
- Doppia chance: 12, 4 vinte, −2,66 € (−22,2%).
- Under/Over 1,5 gol: 10, 2 vinte, −1,95 €. Dall'inizio: 13, 2 vinte, −4,95 €.

**Calibrazione** (confronto tra la probabilità stimata dal modello e la percentuale di vincita reale; escluse multiple e rimborsate; dall'inizio in parentesi)

| Fascia stimata | Giocate | Vinte davvero | Stimata in media |
|---|---|---|---|
| 20–30% | 22 (35) | 18,2% (17,1%) | 26,3% (26,5%) |
| 30–40% | 30 (54) | 30,0% (29,6%) | 35,6% (35,9%) |
| 40–50% | 30 (62) | 23,3% (33,9%) | 45,1% (45,4%) |
| 50–60% | 33 (52) | 60,6% (55,8%) | 54,4% (54,4%) |
| 60–70% | 11 (15) | 54,5% (53,3%) | 63,0% (62,4%) |

Il modello è **troppo ottimista sotto il 50%** (di 5–20 punti, e ormai lo è da due settimane) ed è centrato o un po' prudente tra 50% e 60%. Sono 126 giocate in settimana: l'indizio si rafforza, ma restano fasce da 11 a 33 giocate.

**Quota "da verificare su bet365":** 8 chiuse, 7 vinte, +6,93 € (ROI +67,3%); quelle con quota gratuita: 133, 43 vinte, −9,97 € (ROI −7,1%). Dall'inizio: 17 contro 225. Con solo 8 e 17 giocate è un indizio, non una prova (e sono quote che l'utente deve controllare a mano).

**Correzioni dalle notizie:** nessuna giocata della settimana (e dall'inizio) ha una `correzioneNotizie`: non c'è niente da confrontare.

**Quote prese davvero:** vedi sopra. Tutte le segnature sono su bet365. Delle coppie e multiple non c'è una "quota minima" da confrontare. In media la quota presa è uguale alla mostrata (±0,05). La segnatura vecchia (Levante, 21/10) non ha il bookmaker ("non indicato").

**Modello contro mercato** (dal 30/10, `confrontoModello`): la domanda è se le nostre probabilità funzionano meglio di quelle del mercato. **No, finora no.** Errore medio (Brier: più basso è meglio):

| | Partite | Errore modello | Errore modello corretto | Errore mercato |
|---|---|---|---|---|
| Le migliori 20 del giorno | 171 | 0,1989 | 0,1984 | 0,1902 |
| Tutte | 506 | 0,2190 | 0,2200 | 0,2107 |

Il mercato è meglio in entrambi i casi, anche dopo la correzione. Non scatta quindi l'avviso "il modello corretto indovina meglio del mercato". Nei tre gruppi (modello sopra / d'accordo / sotto il mercato di 5 punti): sulle migliori, 16 su 20 (80%) quando il modello è sopra, 78 su 107 (72,9%) quando è d'accordo, 34 su 44 (77,3%) quando è sotto; su tutte le 506 partite, 66,7% (129 partite), 67,9% (293), 76,2% (84). Il gruppo "modello sotto il mercato" vince più della probabilità del mercato (+6,05 € a 1 € a partita su tutte; +3,49 € sulle migliori), ma sono 84 e 44 partite, un indizio. Dove il modello è sopra il mercato, non vince di più (−9,49 € su tutte).

**Taratura automatica** (solo il calcio è tarato, `a` e `b` sono la correzione del modello): 26/10 a 0,209 b 0,920 (172 partite); 27/10 0,237 / 0,902 (185); 28/10 0,318 / 0,911 (216); 29/10 0,301 / 0,892 (258); 30/10 0,322 / 1,106 (139); 31/10 0,257 / 0,887 (297); 1/11 0,210 / 0,817 (401). Cioè la correzione si muove poco, tranne il 30/10 (b 1,106 su sole 139 partite, probabile cambio di campione). Per NBA, basket, tennis e pallavolo non c'è correzione.

**Coppie a quota 2** (dal 30/10, quindi settimana e totale coincidono; con 1 € a coppia; a quota 2 si va in pari vincendo il 50%):

| Modo | Chiuse | Vinte | % vinta | Profitto |
|---|---|---|---|---|
| Margine (quelle mostrate) | 68 | 36 | 52,9% | +2,67 € |
| Probabilità | 73 | 40 | 54,8% | +3,72 € |
| Modello | 69 | 38 | 55,1% | +5,16 € |
| Confermate (modello e mercato vicini) | 36 | 21 | 58,3% | +5,44 € |

Tutte e quattro sono in positivo, ma sotto 50 coppie (le confermate) o poco sopra, quindi è solo un indizio, e le coppie dei vari modi condividono molte partite (non sono prove indipendenti). Il modo "confermate" è il migliore, ma con 36 coppie la differenza non basta per cambiare. Sommando tutte le coppie (anche i casi non mostrati) il risultato è negativo (161 coppie chiuse, 75 vinte, −14,77 €): le coppie "tutte" a 1 € perdono, ma sono diverse da quelle mostrate. Doppie 10 chiuse (+0,51 €), triple 6 (−1,29 €).

**Multiple bonus: per probabilità o per margine** (dal 30/10): per **margine** 12 multiple chiuse, 0 vinte, −12 €, in media 11 partite perse per multipla (sono molto lunghe, da 10 a 91 partite); per **probabilità** (da 5 e da 10) 6 chiuse, 1 vinta, −2,17 € e in media 1,5 partite perse. Le multiple per probabilità vanno meglio e perdono molte meno partite, ma sono 6 giocate.

**Mercati** (`storicoMercati`, partite di multiple e coppie, 1 € a partita; "vince più del mercato" = percentuale vinta sopra la probabilità del mercato):
- Vincono più del mercato su almeno 30 partite: Calcio 1X2 → 1 (50 partite, 78,0% contro 67,3%, +4,50 €), Calcio Over 1,5 (40, 80,0% contro 70,1%, +3,03 €), Calcio Over 2,5 (75, 70,7% contro 65,4%, +0,47 €).
- Perdono su almeno 30 partite: Calcio Under 3,5 (116, 62,9% contro 67,2%, −14,61 €), Doppia chance 1X (71, −7,11 €), Doppia chance X2 (67, −6,04 €), Doppia chance 12 (34, −2,54 €).
- Sotto 30 partite (solo indizio): NBA trasferta vince 10 su 12, NBA casa solo 6 su 12; basket casa 4 su 9; calcio 1X2 → 2: 8 su 8.

**Dove conviene giocare** (`bookmakerMigliore`): su 24 coppie il bookmaker migliore paga in media solo +0,02 in quota rispetto a quello mostrato, quindi quasi niente. I più spesso migliori: Winamax (8 volte), Sunbet (4), Betsson e Betwin360 (2 ciascuno). L'utente gioca solo su bet365: non ci perde in modo evidente, la differenza è piccola. Con 4 segnature non si può dire altro.

**Chiusura delle quote** (82 partite): la quota si muove a favore nostro nel 50,0% dei casi, cioè nessun vantaggio rispetto alla quota di chiusura.

**Schedina del giorno** (`schedinaDelGiorno`, dal 02/11/2026): non ci sono ancora giornate con questo dato e `bilancioSchedineScelte` ha 0 chiuse. Niente da riferire questa settimana.

## 4. Pronostici e doppie/triple
Registro dal 22/10: i pronostici sì/no (per esempio "Over 1,5 sì/no") sono stati valutati ogni giorno.

- **Pronostici ✅ (giocabili):** **zero**, anche dall'inizio (0 su 520). La soglia per essere ✅ non è mai stata raggiunta: va capito se è troppo alta.
- **Migliori e tutti** (settimana): tutti 214 giusti e 25 sbagliati (89,5%) contro 85,9% promesso (limite prudente 83,9%), 35 aperti; migliori 134 giusti e 14 sbagliati (90,5%) contro 85,0% promesso (limite prudente 83,2%), 23 aperti. Dall'inizio: tutti 88,4% (427/483) contro 85,7%; migliori 90,6% (250/276) contro 84,7%. Escono più di quanto promesso, e i migliori escono un po' più della media di tutti (1,0–2,2 punti), come atteso.
- **Per partita** (settimana): 171 partite, 127 con tutti i pronostici giusti, 21 con almeno uno sbagliato, 23 aperte. Dall'inizio: 317 partite, 249 tutte giuste, 43 con sbagliati. Quando una partita va storta sbagliano spesso più pronostici insieme.
- **Doppie e triple** (1 € a schedina, in prova, tutte con quote "da verificare"): settimana 18 schedine, 10 vinte, 5 perse, 3 aperte, +0,34 € (rendimento +2,3%). Doppie: 11 (6 vinte, 2 perse, 3 aperte), +1,01 € (+12,6%). Triple: 7 (4 vinte, 3 perse), −0,67 € (−9,6%). Dall'inizio: 27 schedine, 18 vinte, 6 perse, +3,14 € (+13,1%); doppie 16 (+15,5%), triple 11 (+10,3%). Il metodo regge in positivo, ma in settimana il guadagno è quasi zero e il campione è piccolo.

## 5. Salute del sistema
- **Giorni senza giro di Claude:** 0 su 7 (tutti `giro: "claude"`). Meglio della settimana scorsa, quando c'era stato un giorno di riserva.
- **Controlli prima delle partite:** 65 giocate annullate dalla "regola automatica (Claude non disponibile)": è il controllo prima della partita, non il giro del mattino. Il fatto va chiarito (vedi proposte).
- **Errori ricorrenti nelle giornate** (numero di volte in 7 giorni):
  - odss-api con errori/limite di richieste: 17 volte, più 7 "Controlli prima delle partite (odss-api)" e 1 ESPN; budget dei controlli raggiunto più volte;
  - storico tennis fermo: ATP 7 volte, WTA 6; superficie sconosciuta per ATP Swiss Indoors Basel (7 volte) e Paris Masters (1);
  - quote non trovate: Süper Lig 3, Superliga Danimarca 2, pallavolo 6, PlusLiga 5, NBL Australia 3 (più 3 errori odss-api NBL), MLS 2, Bundesliga 2, 2. Bundesliga 2, Bundesliga Austria 2, Allsvenskan 2, e una volta per Serie A, Ligue 1, LaLiga, Eredivisie, Primeira Liga, Pro League, Super League Grecia, Eliteserien, Liga Profesional, Liga MX, Scottish Premiership e League One, Superliga Romania, WTA Pan Pacific;
  - squadre non riconosciute: 3 volte "squadre" (varie), Efeler Ligi 2 volte, Bundesliga 2 volte, SuperLega 2 volte;
  - pronostici senza esito dopo diversi giorni: 6 volte; partite già iniziate escluse: 2.
  - Competizioni scoperte (senza storico gratuito): Serie A1 femminile di pallavolo (27, 28, 31/10 e 1/11), Champions League maschile e femminile (29/10).
- **Giocate senza esito da più di 7 giorni:** 1 (Gateshead–Tamworth 1X2, 23/10).
- **`erroriDati` della build:** nessuno.
- **Crediti delle quote** (`data/raccolta/*.json`, settimana 26/10–1/11): calcio 16 richieste usate (solo dal 29/10, ritmo basso), tennis 11 (+7 serali), basket 9, pallavolo 14 (OddsPapi); NBA con SportsGameOdds 0 al mattino e 3–12 oggetti la sera. Il credito principale è sceso da 321 (26/10) a 252 (31/10), cioè circa 12 richieste al giorno; il 1/11 è tornato a 488 (rinnovo) e oggi è a 470. Il file di stato odss dice 360 rimaste su 500, con reset il 21/11. Con 12 al giorno ne servono circa 250 per arrivare al 21/11: il ritmo è sostenibile. Il budget dei controlli (tetto giornaliero) però è raggiunto spesso.

## 6. Ricerca di un sistema
**Dati:** 518 partite di coppie e multiple (una per giorno, partita e mercato; 23/10–2/11), di cui 187 chiuse nella parte *ricerca* (23–25/10) e 331 nella parte *verifica* (26/10–1/11), che la ricerca non ha visto. **Regole provate: 760** (singole condizioni e coppie di condizioni su sport, mercato, fascia di quota, lato casa/trasferta, fascia di probabilità del mercato, accordo modello–mercato entro 3/5/8 punti, modello sopra il mercato, movimento verso la chiusura). Con almeno 40 partite e guadagno positivo nella ricerca ne sono rimaste 13; **4 restano positive nella verifica** con almeno 10 partite, ma sono quasi la stessa cosa (le prime tre si sovrappongono quasi del tutto).

| Regola | Ricerca: partite, % vinta (mercato), guadagno | Verifica: partite, % vinta (mercato), guadagno | Settimane di fila |
|---|---|---|---|
| Probabilità del mercato 70–80% (e le sue varianti: calcio; quota 1,25–1,40) | 47 partite, 83% (71%), +4,23 € | 85 partite, 78% (72%), +1,70 € | 1 |
| Calcio con probabilità del mercato 70–80% | 42, 86% (71%), +5,22 € | 75, 80% (72%), +3,76 € | 1 |
| Modello e mercato distanti più di 3 punti, ma modello non sopra | 71, 76% (67%), +4,63 € | 107, 73% (67%), +1,50 € | 1 |

- **Spiegazione sensata?** La prima regola sì: i favoriti "solidi" potrebbero essere pagati un po' meno di quanto valgono. La terza è un po' meno chiara. Le regole con "modello e mercato distanti" in generale perdono nella verifica (−9,92 € con 220 partite), quindi il criterio non regge.
- **Avvertenza:** più regole si provano, più è facile trovarne una che sembra vincente per caso. Ne ho provate 760: ci si aspetta che alcune sembrino buone solo per caso. Una regola diventa interessante solo dopo aver retto **almeno 3 settimane di verifica di fila**. Questa è la prima volta che la ricerca viene fatta (nei rapporti precedenti in `docs/report/` non c'è), quindi il conto è: **1 settimana per tutte**. Prima del 23/11/2026 i dati sono pochi: è solo un indizio. Nessuna modifica automatica.

## 7. Proposte (in ordine di importanza)

1. **Continuare la prova e non giocare di più soldi veri finché le proposte non sono in utile su un campione più grande.**
   - Perché: le 4 giocate vere hanno perso 38,57 € (campione di 4), mentre le 242 proposte sono a −3,85 € (ROI −1,5%) e il modello non batte il mercato (0,219 contro 0,211).
   - Sicurezza: media (campione di 242, ma poche settimane).
   - Rischio a farlo: nessuno. A non farlo: giocare soldi veri con un metodo non ancora provato.

2. **Valutare di togliere le "speciali" e il mercato Under/Over 2,5 se continuano così fino a metà novembre.**
   - Perché: speciali 10 vinte su 57 (ROI −32,8%); Under/Over 2,5 settimana 5 su 21 (−49%); Calcio Under 3,5 nelle multiple, 116 partite, −14,61 €.
   - Sicurezza: media-bassa (campioni tra 21 e 116).
   - Rischio a farlo: perdere qualche giocata che andrebbe bene; a non farlo: perdere ancora su questi mercati (documento di progetto §7.3: aspettare circa un mese).

3. **Rivedere le probabilità del modello sotto il 50%, o almeno non fidarsi delle giocate in quelle fasce.**
   - Perché: stimate 26%, 36%, 45% nelle tre fasce basse, vinte davvero 18%, 30%, 23% (settimana; 17%, 30%, 34% dall'inizio).
   - Sicurezza: media (126 giocate in settimana, 203 in tutto).
   - Rischio a farlo: perdere qualche giocata valida; a non farlo: puntare su giocate che non hanno il vantaggio che sembra.

4. **Capire perché la "regola automatica" annulla così tante giocate (65 in settimana) e perché nessun pronostico è ✅ (0 su 520).**
   - Perché: il controllo prima delle partite (odss-api) raggiunge spesso il limite; la soglia dei ✅ non è mai stata superata.
   - Sicurezza: alta sul fatto, da chiarire la causa.
   - Rischio a farlo: nessuno (solo controllo). A non farlo: perdere quote e pronostici utili.

5. **Tenere d'occhio, senza usarle ancora, le multiple per probabilità e le coppie "confermate".**
   - Perché: multiple per probabilità 1 vinta su 6 ma in media solo 1,5 partite perse (contro 11 per margine); coppie "confermate" 21 su 36 (+5,44 €). Sono i modi con i numeri migliori.
   - Sicurezza: bassa (6 e 36 giocate).
   - Rischio a farlo: nessuno (solo osservare). A non farlo: restare su un modo che finora perde con le multiple lunghe.

Nessun modello garantisce vincite, e su poche settimane la fortuna pesa più del metodo.
