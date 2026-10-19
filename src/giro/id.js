import { slug } from '../calcio/testo.js';

// Solo per l'id: "+" → "piu" e "-" usato come segno davanti a una cifra → "meno",
// così Handicap asiatico -1 e +1 non collidono. "2-1" (risultato esatto) resta "2-1".
const segni = (testo) => String(testo).replace(/\+/g, ' piu ').replace(/(^|\s)-(?=\d)/g, '$1meno ');

export const idCandidato = (idPartita, mercato, selezione) => `${idPartita}-${slug(segni(mercato))}-${slug(segni(selezione))}`;
