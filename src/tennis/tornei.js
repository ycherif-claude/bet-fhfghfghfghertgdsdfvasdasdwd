// Tornei tennis: Slam ATP (al meglio dei 5 set) e superfici note dei principali tornei non sul cemento.

// Testo normalizzato da chiave e titolo di The Odds API: minuscole, senza accenti, parole separate da spazi.
const testo = (...parti) => ` ${parti.map((p) => String(p ?? '')).join(' ')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim()} `;
const contiene = (t, frasi) => frasi.some((f) => t.includes(` ${f} `));

const SLAM = ['aus open', 'australian open', 'french open', 'roland garros', 'wimbledon', 'us open'];

// Slam ATP (al meglio dei 5 set) dalla chiave di The Odds API o dal titolo; mai per la WTA.
export function slamAtp({ chiave, titolo, circuito } = {}) {
  const k = String(chiave ?? '');
  const atp = circuito ? circuito === 'atp' : /^tennis_atp_/.test(k) || /^\s*ATP\b/i.test(String(titolo ?? ''));
  if (!atp || /^tennis_wta_/.test(k)) return false;
  return contiene(testo(k.replace(/_/g, ' '), titolo), SLAM);
}

export const bestOfDi = (torneo) => (slamAtp(torneo) ? 5 : 3);

// Superfici note: si controllano prima dello storico, perché i nomi di sponsor o in lingua
// (es. "Internazionali BNL d'Italia") non si abbinano ai titoli di The Odds API.
// `circuito` limita la voce a un circuito (Stoccarda: terra la WTA, erba l'ATP).
export const SUPERFICI_NOTE = Object.freeze([
  { frasi: ['rome', 'roma', 'italian open', 'internazionali'], superficie: 'terra' },
  { frasi: ['madrid'], superficie: 'terra' },
  { frasi: ['monte carlo', 'montecarlo'], superficie: 'terra' },
  { frasi: ['roland garros', 'french open'], superficie: 'terra' },
  { frasi: ['barcelona'], superficie: 'terra' },
  { frasi: ['hamburg'], superficie: 'terra' },
  { frasi: ['munich'], superficie: 'terra' },
  { frasi: ['stuttgart'], circuito: 'wta', superficie: 'terra' },
  { frasi: ['stuttgart'], circuito: 'atp', superficie: 'erba' },
  { frasi: ['charleston'], superficie: 'terra' },
  { frasi: ['strasbourg'], superficie: 'terra' },
  { frasi: ['rabat'], superficie: 'terra' },
  { frasi: ['wimbledon'], superficie: 'erba' },
  { frasi: ['halle'], superficie: 'erba' },
  { frasi: ['queens', 'queen s'], superficie: 'erba' },
  { frasi: ['berlin'], superficie: 'erba' },
  { frasi: ['eastbourne'], superficie: 'erba' },
  { frasi: ['bad homburg'], superficie: 'erba' },
  { frasi: ['hertogenbosch'], superficie: 'erba' },
  { frasi: ['mallorca'], superficie: 'erba' },
].map((v) => Object.freeze({ ...v, frasi: Object.freeze([...v.frasi]) })));

// Superficie dalla tabella delle superfici note; null se il torneo non c'è.
export function superficieNota({ chiave, titolo, circuito } = {}) {
  const t = testo(String(chiave ?? '').replace(/_/g, ' '), titolo);
  const c = circuito ?? (/^tennis_wta_/.test(String(chiave ?? '')) ? 'wta' : /^tennis_atp_/.test(String(chiave ?? '')) ? 'atp' : null);
  const voce = SUPERFICI_NOTE.find((v) => (!v.circuito || v.circuito === c) && contiene(t, v.frasi));
  return voce?.superficie ?? null;
}
