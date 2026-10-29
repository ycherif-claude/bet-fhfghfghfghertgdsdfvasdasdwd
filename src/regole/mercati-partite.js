// Storico per mercato delle partite di multiple bonus e coppie a quota 2 [utente, 29/10/2026]: quali mercati
// vincono di più, con la quota media e quanto si sarebbe vinto giocando ogni partita da sola con 1 €.
// Ogni partita conta una volta per giorno e mercato, anche se è in più multiple o coppie.
import { CONFIG } from '../config.js';
import { pm, tutteLeCoppie } from './coppie-quota2.js';

const SPORT = { calcio: 'Calcio', nba: 'NBA', basket: 'Basket', pallavolo: 'Pallavolo', tennis: 'Tennis' };
const arrotonda = (x, cifre = 2) => Math.round(x * 10 ** cifre) / 10 ** cifre;

// "Vincente" ha il nome della squadra come selezione: si raggruppa per casa o trasferta.
export function chiaveMercato(g) {
  let selezione = String(g.selezione ?? '');
  if (g.mercato === 'Vincente') {
    const [casa, trasferta] = String(g.partita ?? '').split(' - ');
    selezione = selezione === casa ? 'casa' : selezione === trasferta ? 'trasferta' : 'squadra';
  }
  return `${SPORT[g.sport] ?? g.sport}: ${g.mercato} → ${selezione}`;
}

// Gambe di una giornata: tutte le multiple bonus e tutte le coppie, una volta per partita e mercato.
export function gambeDelGiorno(giornata) {
  const tutte = [
    ...(giornata?.multipleBonus ?? []).flatMap((m) => m?.gambe ?? []),
    ...tutteLeCoppie(giornata).flatMap((c) => c?.gambe ?? []),
  ];
  const viste = new Map();
  for (const g of tutte) {
    if (!g?.idPartita) continue;
    const k = `${g.idPartita}|${g.mercato}|${g.selezione}`;
    const prima = viste.get(k);
    if (!prima || (prima.esito == null && g.esito != null)) viste.set(k, g);
  }
  return [...viste.values()];
}

// Righe per mercato, dal più giocato: partite chiuse, vinte, quota media, probabilità media del mercato e
// guadagno con 1 € a partita (rimborsate a parte, fuori dai conti).
export function storicoMercati(giornate) {
  const gruppi = new Map();
  for (const giornata of giornate) {
    for (const g of gambeDelGiorno(giornata)) {
      const k = chiaveMercato(g);
      const r = gruppi.get(k) ?? { mercato: k, partite: 0, vinte: 0, perse: 0, rimborsate: 0, aperte: 0, sommaQuota: 0, sommaProb: 0, profitto: 0 };
      if (g.esito === 'vinta' || g.esito === 'persa') {
        r.partite++;
        r.sommaQuota += g.quota;
        r.sommaProb += g.probMercato ?? 0;
        if (g.esito === 'vinta') { r.vinte++; r.profitto += g.quota - 1; } else { r.perse++; r.profitto -= 1; }
      } else if (g.esito === 'rimborsata') r.rimborsate++;
      else r.aperte++;
      gruppi.set(k, r);
    }
  }
  return [...gruppi.values()]
    .map(({ sommaQuota, sommaProb, ...r }) => ({
      ...r,
      percentuale: r.partite ? arrotonda(r.vinte / r.partite, 4) : null,
      quotaMedia: r.partite ? arrotonda(sommaQuota / r.partite) : null,
      probMercato: r.partite ? arrotonda(sommaProb / r.partite, 4) : null,
      profitto: arrotonda(r.profitto),
      rendimento: r.partite ? arrotonda(r.profitto / r.partite, 4) : null,
    }))
    .sort((a, b) => b.partite - a.partite || a.mercato.localeCompare(b.mercato));
}

// Modello contro mercato [utente, 29/10/2026], sulle stesse partite (solo quelle con la probabilità del modello):
// errore medio (Brier: più basso è meglio) del modello grezzo, del modello corretto dalla taratura automatica (dove
// non c'è ancora la correzione vale il grezzo) e del mercato; partite divise per quanto il modello corretto si scosta.
export function confrontoModello(giornate) {
  const scarto = CONFIG.coppieQuota2.scartoConferma;
  const gruppi = [
    { gruppo: 'sopra', nome: `modello sopra il mercato di ${Math.round(scarto * 100)} punti o più` },
    { gruppo: 'accordo', nome: `modello e mercato d'accordo (meno di ${Math.round(scarto * 100)} punti)` },
    { gruppo: 'sotto', nome: `modello sotto il mercato di ${Math.round(scarto * 100)} punti o più` },
  ].map((g) => ({ ...g, partite: 0, vinte: 0, sommaProb: 0, profitto: 0 }));
  let partite = 0;
  let vinte = 0;
  let erroreModello = 0;
  let erroreCorretto = 0;
  let conCorrezione = 0;
  let erroreMercato = 0;
  for (const giornata of giornate) {
    for (const g of gambeDelGiorno(giornata)) {
      if (typeof g.probModello !== 'number' || (g.esito !== 'vinta' && g.esito !== 'persa')) continue;
      const v = g.esito === 'vinta' ? 1 : 0;
      partite++;
      vinte += v;
      erroreModello += (g.probModello - v) ** 2;
      erroreCorretto += (pm(g) - v) ** 2;
      if (pm(g) !== g.probModello) conCorrezione++;
      erroreMercato += (g.probMercato - v) ** 2;
      const d = pm(g) - g.probMercato;
      const r = gruppi[d >= scarto - 1e-9 ? 0 : d <= -scarto + 1e-9 ? 2 : 1];
      r.partite++;
      r.vinte += v;
      r.sommaProb += g.probMercato;
      r.profitto += v ? g.quota - 1 : -1;
    }
  }
  return {
    partite,
    vinte,
    erroreModello: partite ? arrotonda(erroreModello / partite, 4) : null,
    erroreCorretto: partite ? arrotonda(erroreCorretto / partite, 4) : null,
    conCorrezione,
    erroreMercato: partite ? arrotonda(erroreMercato / partite, 4) : null,
    gruppi: gruppi.map(({ sommaProb, ...r }) => ({
      ...r,
      percentuale: r.partite ? arrotonda(r.vinte / r.partite, 4) : null,
      probMercato: r.partite ? arrotonda(sommaProb / r.partite, 4) : null,
      profitto: arrotonda(r.profitto),
    })),
  };
}

// Quota di chiusura [utente, 29/10/2026]: per le partite di coppie e multiple con la chiusura (prob di Pinnacle
// nell'ultimo controllo), quante volte il mercato si è mosso verso la nostra scelta, di quanto in media e quanto
// valeva la quota del mattino con la probabilità di chiusura (quota × prob di chiusura − 1: sopra 0 = vantaggio).
export function chiusuraPartite(giornate) {
  const gruppi = new Map();
  const aggiungi = (k, g) => {
    const r = gruppi.get(k) ?? { gruppo: k, partite: 0, aFavore: 0, sommaMovimento: 0, sommaValore: 0 };
    r.partite++;
    if (g.chiusura.prob > g.probMercato + 1e-9) r.aFavore++;
    r.sommaMovimento += g.chiusura.prob - g.probMercato;
    r.sommaValore += g.quota * g.chiusura.prob - 1;
    gruppi.set(k, r);
  };
  for (const giornata of giornate) {
    for (const g of gambeDelGiorno(giornata)) {
      if (typeof g.chiusura?.prob !== 'number' || typeof g.probMercato !== 'number' || typeof g.quota !== 'number') continue;
      aggiungi('tutte', g);
      aggiungi(SPORT[g.sport] ?? g.sport, g);
    }
  }
  return [...gruppi.values()].map(({ sommaMovimento, sommaValore, ...r }) => ({
    ...r,
    percentualeAFavore: arrotonda(r.aFavore / r.partite, 4),
    movimento: arrotonda(sommaMovimento / r.partite, 4),
    valore: arrotonda(sommaValore / r.partite, 4),
  }));
}
