// Dati di prova pallavolo per i test del giro (formato di data/raccolta/<data>-pallavolo.json).
export function raccoltaPallavolo(partite = [], data = '2026-10-20') {
  return { data, generataAlle: '2026-10-20T07:55:00+02:00', crediti: { oddspapi: { usate: 2, rimaste: 200 } }, competizioniNonCoperte: [], erroriGiro: [], partite };
}
