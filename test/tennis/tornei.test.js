import test from 'node:test';
import assert from 'node:assert/strict';
import { slamAtp, bestOfDi, superficieNota, SUPERFICI_NOTE } from '../../src/tennis/tornei.js';

test('Slam ATP dalla chiave o dal titolo; mai la WTA né gli altri tornei', () => {
  assert.equal(slamAtp({ chiave: 'tennis_atp_aus_open_singles', titolo: 'ATP Australian Open' }), true);
  assert.equal(slamAtp({ chiave: 'tennis_atp_french_open' }), true);
  assert.equal(slamAtp({ titolo: 'ATP Roland Garros' }), true);
  assert.equal(slamAtp({ chiave: 'tennis_atp_wimbledon' }), true);
  assert.equal(slamAtp({ chiave: 'tennis_atp_us_open', titolo: 'ATP US Open' }), true);
  assert.equal(slamAtp({ titolo: 'ATP US Open' }), true);
  assert.equal(slamAtp({ chiave: 'tennis_wta_us_open', titolo: 'WTA US Open' }), false);
  assert.equal(slamAtp({ chiave: 'tennis_wta_wimbledon', titolo: 'WTA Wimbledon', circuito: 'wta' }), false);
  assert.equal(slamAtp({ chiave: 'tennis_atp_paris_masters', titolo: 'ATP Paris Masters' }), false);
  assert.equal(slamAtp({ titolo: 'ATP Business Open' }), false);
  assert.equal(bestOfDi({ chiave: 'tennis_atp_wimbledon', titolo: 'ATP Wimbledon', circuito: 'atp' }), 5);
  assert.equal(bestOfDi({ chiave: 'tennis_wta_wimbledon', titolo: 'WTA Wimbledon', circuito: 'wta' }), 3);
});

test('superfici note: terra ed erba da chiave o titolo, Stoccarda per circuito; altrimenti null', () => {
  assert.equal(superficieNota({ chiave: 'tennis_atp_italian_open', titolo: 'ATP Italian Open' }), 'terra');
  assert.equal(superficieNota({ chiave: 'tennis_wta_x', titolo: 'WTA Internazionali BNL' }), 'terra');
  assert.equal(superficieNota({ chiave: 'tennis_atp_monte_carlo_masters', titolo: 'ATP Monte-Carlo Masters' }), 'terra');
  assert.equal(superficieNota({ chiave: 'tennis_atp_x', titolo: 'ATP Queen\'s Club Championships' }), 'erba');
  assert.equal(superficieNota({ chiave: 'tennis_wta_x', titolo: "WTA 's-Hertogenbosch" }), 'erba');
  assert.equal(superficieNota({ chiave: 'tennis_wta_stuttgart_open', titolo: 'WTA Stuttgart Open' }), 'terra');
  assert.equal(superficieNota({ chiave: 'tennis_atp_stuttgart_open', titolo: 'ATP Stuttgart Open' }), 'erba');
  assert.equal(superficieNota({ chiave: 'tennis_atp_wimbledon', titolo: 'ATP Wimbledon' }), 'erba');
  assert.equal(superficieNota({ chiave: 'tennis_atp_paris_masters', titolo: 'ATP Paris Masters' }), null);
  assert.equal(superficieNota({ chiave: 'tennis_wta_tokyo', titolo: 'WTA Tokyo' }), null);
  assert.ok(Object.isFrozen(SUPERFICI_NOTE));
});
