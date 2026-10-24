// Alias delle squadre "non riconosciute" degli erroriGiro del 23 e 24/10/2026 [correzioni 24/10/2026, punto 6], con i
// nomi dei nostri storici: CSV di football-data.co.uk della stagione 2026/27 (scaricati il 24/10) e storico
// TheSportsDB della pallavolo (data/storico/pallavolo-turchia.json). Mai indovinare: una squadra che nello storico
// non c'è (Sultanbeyli, SV Warnemünde, VC Bitterfeld-Wolfen) o che non si può legare con certezza (Gebze Genclik:
// nello storico c'è solo "Gebze Belediyespor", un altro tipo di club nel nome) resta non riconosciuta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { abbinaSquadra, abbinaEspn } from '../../src/calcio/squadre.js';
import { ALIAS_ESPN_CSV } from '../../src/calcio/competizioni.js';
import { abbinaSquadra as abbinaPallavolo, squadreStorico } from '../../src/pallavolo/squadre.js';

// Nomi dei CSV 2026/27 (HomeTeam/AwayTeam) delle competizioni interessate.
const CSV = {
  D1: ['Augsburg', 'Bayern Munich', 'Dortmund', 'Ein Frankfurt', 'Elversberg', 'FC Koln', 'Freiburg', 'Hamburg', 'Hoffenheim', 'Leverkusen', "M'gladbach", 'Mainz', 'Paderborn', 'RB Leipzig', 'Schalke 04', 'Stuttgart', 'Union Berlin', 'Werder Bremen'],
  D2: ['Bielefeld', 'Bochum', 'Braunschweig', 'Cottbus', 'Darmstadt', 'Dresden', 'Greuther Furth', 'Hannover', 'Heidenheim', 'Hertha', 'Holstein Kiel', 'Kaiserslautern', 'Karlsruhe', 'Magdeburg', 'Nurnberg', 'Osnabruck', 'St Pauli', 'Wolfsburg'],
  SP1: ['Alaves', 'Ath Bilbao', 'Ath Madrid', 'Barcelona', 'Betis', 'Celta', 'Elche', 'Espanol', 'Getafe', 'La Coruna', 'Levante', 'Malaga', 'Osasuna', 'Real Madrid', 'Santander', 'Sevilla', 'Sociedad', 'Valencia', 'Vallecano', 'Villarreal'],
  SP2: ['Albacete', 'Almeria', 'Andorra', 'Burgos', 'Cadiz', 'Castellon', 'Celta B', 'Ceuta', 'Cordoba', 'Eibar', 'Eldense', 'Girona', 'Granada', 'Las Palmas', 'Leganes', 'Mallorca', 'Oviedo', 'Sabadell', 'Sociedad B', 'Sp Gijon', 'Tenerife', 'Valladolid'],
  P1: ['Academico Viseu', 'Alverca', 'Arouca', 'Benfica', 'Casa Pia', 'Estoril', 'Estrela', 'Famalicao', 'Gil Vicente', 'Guimaraes', 'Maritimo', 'Moreirense', 'Nacional', 'Porto', 'Rio Ave', 'Santa Clara', 'Sp Braga', 'Sp Lisbon'],
  F2: ['Annecy', 'Boulogne', 'Clermont', 'Dijon', 'Dunkerque', 'Grenoble', 'Guingamp', 'Laval', 'Metz', 'Montpellier', 'Nancy', 'Nantes', 'Pau FC', 'Red Star', 'Reims', 'Rodez', 'Sochaux', 'St Etienne'],
  SWE: ['AIK', 'Brommapojkarna', 'Degerfors', 'Djurgarden', 'Elfsborg', 'GAIS', 'Goteborg', 'Hacken', 'Halmstad', 'Hammarby', 'Malmo FF', 'Mjallby', 'Sirius', 'Vasteras SK'],
};

test('alias calcio: i nomi di The Odds API e di ESPN non riconosciuti il 23 e il 24/10 trovano il nome del CSV', () => {
  for (const [nome, csv, atteso] of [
    ['FSV Mainz 05', 'D1', 'Mainz'], ['SV Darmstadt 98', 'D2', 'Darmstadt'], ['Real Racing Club de Santander', 'SP1', 'Santander'],
    ['Celta Fortuna', 'SP2', 'Celta B'], ['Vitória SC', 'P1', 'Guimaraes'], ['Stade Lavallois', 'F2', 'Laval'],
  ]) assert.equal(abbinaSquadra(nome, CSV[csv]), atteso, nome);
  // Allsvenskan: campionato senza quote, calendario da ESPN.
  assert.equal(abbinaEspn('Halmstads BK', CSV.SWE, ALIAS_ESPN_CSV.SWE), 'Halmstad');
  // Gli alias non rubano altre squadre: il Celta resta il Celta, la Real Sociedad B resta sua.
  assert.equal(abbinaSquadra('Celta Vigo', CSV.SP1), 'Celta');
  assert.equal(abbinaSquadra('Celta Fortuna', CSV.SP1), null);
  assert.equal(abbinaSquadra('Real Sociedad B', CSV.SP2), 'Sociedad B');
});

test('alias pallavolo: Efeler Ligi con i nomi dello storico TheSportsDB; chi non c\'è resta non riconosciuto', () => {
  const squadre = squadreStorico(JSON.parse(readFileSync('data/storico/pallavolo-turchia.json', 'utf8')).partite);
  const nome = (id) => [...(squadre.get(id) ?? [])][0] ?? null;
  const di = (x) => nome(abbinaPallavolo(x, squadre));
  assert.equal(di('Sungurluspor'), 'Sungurlu Belediyespor');
  assert.equal(di('Spor Toto SK Ankara'), 'Spor Toto');
  assert.equal(di('Istanbul Genclik Spor'), 'İstanbul GSK');
  assert.equal(di('Fenerbahce SK Istanbul'), 'Fenerbahçe Volleyball');
  assert.equal(di('Ibb Spor'), 'İstanbul BB');
  // Quelle già riconosciute restano le stesse.
  assert.equal(di('Halkbank Ankara'), 'Halkbank Ankara');
  assert.equal(di('Gaziantep Gençlik'), 'Gaziantep Gençlik');
  // Nomi veri delle raccolte del 23-24/10, già riconosciuti: restano uguali.
  for (const [x, atteso] of [['Ziraat Bankasi Ankara', 'Ziraat Bankası'], ['Galatasaray SK', 'Galatasaray Volleyball'], ['Onikisubat Bld', 'Onikişubat Belediyespor'], ['TFL Altekma', 'Altekma']]) assert.equal(di(x), atteso, x);
  // Mai indovinare.
  assert.equal(di('Sultanbeyli Bld'), null);
  assert.equal(di('Gebze Genclik'), null);
  const bundesliga = squadreStorico(JSON.parse(readFileSync('data/storico/pallavolo-bundesliga.json', 'utf8')).partite);
  assert.equal(abbinaPallavolo('SV Warnemünde', bundesliga), null);
  assert.equal(abbinaPallavolo('VC Bitterfeld-Wolfen', bundesliga), null);
});
