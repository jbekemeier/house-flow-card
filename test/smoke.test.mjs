import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- Minimaler Browser-Stub -------------------------------------------------
const registry = new Map();
function fakeEl() {
  const el = {
    textContent: '',
    dataset: {},
    style: { setProperty() {} },
    classList: { toggle() {} },
    setAttribute() {},
    addEventListener() {},
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
  };
  return el;
}
globalThis.HTMLElement = class {
  attachShadow() {
    this.shadowRoot = { innerHTML: '', ...fakeEl() };
    return this.shadowRoot;
  }
  dispatchEvent() {}
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
globalThis.customElements = {
  get: (n) => registry.get(n),
  define: (n, cls) => registry.set(n, cls),
};
globalThis.window = {};

await import('../house-flow-card.js');
const Card = registry.get('house-flow-card');

const config = () => ({
  home: { entity: 'sensor.haus' },
  devices: [
    { entity: 'sensor.a' },
    { entity: 'sensor.b' },
    { entity: 'sensor.c' },
  ],
});
const st = (state, unit = 'W') => ({ state, attributes: { unit_of_measurement: unit } });
const make = (cfg, states) => {
  const card = new Card();
  card.setConfig(cfg);
  card.hass = { states, locale: { language: 'de' } };
  return card;
};

test('Registrierung', () => {
  assert.ok(Card);
  assert.equal(window.customCards.filter((c) => c.type === 'house-flow-card').length, 1);
});

test('setConfig: gültig und ungültig', () => {
  assert.doesNotThrow(() => new Card().setConfig(config()));
  assert.throws(() => new Card().setConfig(null));
  assert.throws(() => new Card().setConfig({ devices: [{ entity: 'x' }] }), /home\.entity/);
  assert.throws(() => new Card().setConfig({ home: { entity: 'x' } }), /devices/);
  assert.throws(() => new Card().setConfig({ home: { entity: 'x' }, devices: [] }), /devices/);
});

test('Sonstige: W und kW gemischt', () => {
  const card = make(config(), {
    'sensor.haus': st('1000'),
    'sensor.a': st('200'),
    'sensor.b': st('0.3', 'kW'),
    'sensor.c': st('100'),
  });
  assert.equal(card._model.home.remaining, 400);
  assert.equal(card._model.home.remainingText, 'Sonstige: 400 W');
});

test('Sonstige: nicht erreichbare Verbraucher zählen nicht mit', () => {
  const card = make(config(), {
    'sensor.haus': st('500'),
    'sensor.a': st('100'),
    'sensor.b': st('unavailable'),
    // sensor.c fehlt
  });
  const m = card._model;
  assert.equal(m.devices[1].unavailable, true);
  assert.equal(m.devices[1].text, '–');
  assert.equal(m.devices[2].unavailable, true);
  assert.equal(m.home.remaining, 400);
});

test('Sonstige ist nie negativ', () => {
  const card = make(config(), {
    'sensor.haus': st('100'),
    'sensor.a': st('300'),
    'sensor.b': st('unknown'),
    'sensor.c': st('abc'),
  });
  assert.equal(card._model.home.remaining, 0);
});

test('Haus nicht erreichbar', () => {
  const card = make(config(), { 'sensor.a': st('1') });
  assert.equal(card._model.home.unavailable, true);
  assert.equal(card._model.home.remainingText, '');
});

test('Formatierung (de)', () => {
  const card = make(config(), {});
  assert.equal(card._fmt(0), '0 W');
  assert.equal(card._fmt(5.5), '5,5 W');
  assert.equal(card._fmt(560), '560 W');
  assert.equal(card._fmt(1500), '1,5 kW');
  assert.equal(card._fmt(null), '–');
});

test('Animationsdauer', () => {
  const card = make({ ...config(), max_expected_power: 600, min_flow_rate: 0.75, max_flow_rate: 6 }, {});
  assert.equal(card._dur(0), 6);
  assert.equal(card._dur(600), 0.75);
  assert.equal(card._dur(5000), 0.75);
  assert.equal(card._dur(300), 3.38);
});

test('Aktiv-Schwelle', () => {
  const card = make({ ...config(), active_threshold: 5 }, {
    'sensor.haus': st('50'),
    'sensor.a': st('4'),
    'sensor.b': st('5'),
    'sensor.c': st('0'),
  });
  assert.deepEqual(card._model.devices.map((d) => d.active), [false, true, false]);
});

test('13 Verbraucher (mehr als Palette)', () => {
  const devices = Array.from({ length: 13 }, (_, i) => ({ entity: `sensor.d${i}` }));
  const states = { 'sensor.haus': st('1000') };
  devices.forEach((d) => { states[d.entity] = st('10'); });
  const card = make({ home: { entity: 'sensor.haus' }, devices }, states);
  assert.equal(card._model.devices.length, 13);
  assert.equal(card._model.home.remaining, 870);
});

test('Signatur-Vergleich verhindert unnötige Neuberechnung', () => {
  const card = make(config(), { 'sensor.haus': st('100') });
  const first = card._model;
  card.hass = { states: { 'sensor.haus': st('100') }, locale: { language: 'de' } };
  assert.equal(card._model, first);
  card.hass = { states: { 'sensor.haus': st('101') }, locale: { language: 'de' } };
  assert.notEqual(card._model, first);
});
