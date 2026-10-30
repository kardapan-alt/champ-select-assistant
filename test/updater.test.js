const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

// updater.js wymaga Electrona tylko przy starcie aktualizacji; do testu porównania wersji wystarczy atrapa.
const load = Module._load;
Module._load = (request, ...rest) => (request === 'electron' ? { app: {}, shell: {} } : load(request, ...rest));
const { isNewer } = require('../src/updater');
Module._load = load;

test('porównanie wersji aplikacji', () => {
  assert.equal(isNewer('0.6.1', '0.6.0'), true);
  assert.equal(isNewer('0.10.0', '0.9.9'), true);
  assert.equal(isNewer('0.6.0', '0.6.0'), false);
  assert.equal(isNewer('0.5.9', '0.6.0'), false);
});
