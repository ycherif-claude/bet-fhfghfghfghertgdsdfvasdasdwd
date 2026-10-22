# Prova sul passato: calcio e tennis (22/10/2026)

Il modello stima ogni partita con i soli dati precedenti, come farebbe la raccolta quel giorno, e si
confronta con il mercato. Misura principale: **log-loss** (più bassa = previsioni migliori). Una differenza
di 0,01 è già grande; "±" è l'errore standard.

Risultati completi: `data/taratura/calcio.json` e `data/taratura/tennis.json`. Per rifarla:
`npm run taratura-tennis` e `npm run taratura-calcio -- <cartella dei CSV>` (CSV di football-data.co.uk
`<codice>_<stagione>.csv`, stagioni 2019/20-2025/26).

## Calcio (12 campionati, 1X2 e Under/Over 2.5)

Parametri scelti su 2021/22-2023/24, verificati su 2024/25-2025/26 (circa 6.200 partite).

| Mercato | Modello | Pinnacle | Media attuale 50/50 | Peso migliore del modello |
|---|---|---|---|---|
| 1X2 | 1,0167 | 0,9938 | 1,0018 | 0 |
| Under/Over 2.5 | 0,6915 | 0,6764 | 0,6814 | 0 |

- Il modello è peggiore di Pinnacle in tutti i 12 campionati (differenza 1X2 da +0,005 a +0,039). Solo Premier
  League e Championship danno un peso migliore sopra zero (0,2-0,25), senza differenza significativa.
- La media 50/50 attuale è peggiore di Pinnacle da sola (+0,008 ± 0,001 sull'1X2).
- Mezza vita 365 giorni è appena meglio di 182; rho −0,08 va bene. Le differenze sono minime.
- Calibrazione: quando il modello dà l'Over 2.5 al 30-40%, esce il 45%. Sottostima le partite con molti gol.
- Giocate simulate con le regole di oggi (value ≥ 5% sulla quota media, scarto massimo 10 punti):
  **1.498 giocate, vinte il 18%, rendimento −25%, CLV −7,7%**.
- Gli xG nei CSV ci sono solo dalla stagione 2026/27: il loro peso non si può ancora provare.

## Tennis (ATP e WTA, 2025 con Pinnacle; 2024 come rodaggio dell'Elo)

| Circuito | Elo attuale | Elo migliore | Pinnacle | Peso migliore |
|---|---|---|---|---|
| ATP 2025 | 0,6419 | 0,6317 | 0,5965 | 0 |
| WTA 2025 | 0,6348 | 0,6305 | 0,5942 | 0 |

- Elo migliore: ATP kBase 150, esponente 0,5, senza superficie; WTA kBase 200, esponente 0,5, superficie 0,25.
  Migliora l'Elo, ma resta lontano dal mercato. Nel 2026 (contro la media dei bookmaker) il risultato è lo stesso.
- Giocate simulate con le regole di oggi: ATP **878 giocate, rendimento −15%, CLV −7%**;
  WTA **811 giocate, rendimento −11%, CLV −7%**.
- Da gennaio 2026 tennis-data e football-data non hanno più le quote Pinnacle.

## Conclusione

Su 1X2, Under/Over 2.5 e vincente del tennis i nostri modelli non aggiungono informazione a Pinnacle: la
media con il modello peggiora le probabilità, e le giocate che ne escono perdono. Il CLV negativo dice che
non è sfortuna: il mercato si muove contro le nostre scelte.

Proposte (da approvare, non ancora applicate):

1. Peso del modello a 0 (o quasi) su questi mercati: la probabilità diventa quella di Pinnacle senza margine.
2. Il value allora può venire solo dal prezzo: un bookmaker ADM che paga più della quota equa di Pinnacle.
   Serve salvare le quote di ogni bookmaker (oggi si usa la mediana, sempre sotto la quota equa).
3. Il modello resta per i mercati senza Pinnacle (cartellini, angoli, primo tempo...), che il registro misura in queste settimane.

## Metodo appreso (calcio, 1X2 e Under/Over 2.5)

`npm run taratura-appreso -- <cartella dei CSV>`, risultati in `data/taratura/appreso.json`.

Per ogni esito una regressione logistica impara dalle **ultime 2 stagioni** quanto valgono la probabilità di
Pinnacle, il modello Dixon-Coles, la forma (tiri in porta, gol) e la quota migliore tra bet365 e bwin. Si gioca
dove probabilità appresa × quota ADM − 1 ≥ soglia, al massimo una giocata per mercato e partita.
Penalità e soglia scelte solo sul 2023/24; verifica una volta sola su 2024/25 e 2025/26.

- Previsioni: log-loss 0,6196 contro 0,6197 di Pinnacle. Il metodo impara a stare sul mercato, non oltre.
- Giocate di verifica (soglia 2%): **3.244 giocate, rendimento +0,9% ± 2,6%, CLV −1,9%**
  (2024/25 +2,0%, 2025/26 −2,1%). Quasi tutte sul pareggio (2.509).
- Senza modello (solo quota ADM contro Pinnacle equa) si perde: −6% con soglia 2%.

Il metodo appreso passa da −25% (regole di oggi) a circa pari, ma un guadagno vero non c'è: il rendimento è
dentro l'errore e il CLV è negativo. Con le sole quote del mattino e i dati dei CSV non si trova un vantaggio
stabile su Pinnacle in questi mercati.
