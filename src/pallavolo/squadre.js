// Abbinamento dei nomi di OddsPapi alle squadre dello storico TheSportsDB (per id fisso).
// Si confrontano le parole distintive: una squadra è riconosciuta se ha in comune con il nome
// più parole di ogni altra; a parità, o senza parole in comune, non si indovina (null).
import { slug } from '../calcio/testo.js';
import { ALIAS_PALLAVOLO } from './campionati.js';

// Parole che non distinguono una squadra dall'altra.
const GENERICHE = new Set([
  'volley', 'volleyball', 'volleys', 'pallavolo', 'siatkowka', 'voleybol', 'voleybolu', 'women', 'woman', 'ladies', 'club',
  'sc', 'vc', 'ks', 'sk', 'as', 'asd', 'ssd', 'tv', 'sv', 'vfb', 'tsv', 'mtv', 'team', 'spor', 'belediyespor', 'belediye',
  'the', 'de', 'di', 'del', 'fc', 'aps', 'gks', 'azs', 'pge', 'kks', 'bk', 'vk', 'ok', 'cs',
]);

const parole = (nome) => new Set(slug(nome).split('-').filter((p) => p.length > 1 && !GENERICHE.has(p)));

// `squadre`: Map(id TheSportsDB → Set dei nomi visti nello storico). Restituisce l'id o null.
export function abbinaSquadra(nome, squadre) {
  const cercate = parole(nome);
  if (!cercate.size) return null;
  let migliore = null;
  let punti = 0;
  let pari = false;
  for (const [id, nomi] of squadre) {
    const proprie = new Set([...nomi].flatMap((n) => [...parole(n)]));
    for (const a of ALIAS_PALLAVOLO[id] ?? []) proprie.add(a);
    const comuni = [...cercate].filter((p) => proprie.has(p)).length;
    if (comuni > punti) { migliore = id; punti = comuni; pari = false; } else if (comuni && comuni === punti) pari = true;
  }
  return punti && !pari ? migliore : null;
}

// Squadre dello storico: Map(id → Set di nomi), dalle partite salvate.
export function squadreStorico(partite) {
  const out = new Map();
  for (const p of partite) {
    for (const [id, nome] of [[p.idCasa, p.casa], [p.idTrasferta, p.trasferta]]) {
      if (!id) continue;
      if (!out.has(id)) out.set(id, new Set());
      out.get(id).add(nome);
    }
  }
  return out;
}
