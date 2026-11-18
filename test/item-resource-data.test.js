const test = require('node:test');
const assert = require('node:assert/strict');
const { champions, items } = require('../data/catalog.json');
const { canonicalAlias, resourceFor, usesMana } = require('../src/champion-identity');
const { itemFitsResource, itemGivesMana } = require('../src/itemrules');

test('every catalog champion and Jade form has a known resource', () => {
  for (const { alias, id } of champions.filter(c => c.id > 0)) {
    assert.ok(resourceFor(alias), `Missing resource for ${alias} (${id})`);
    assert.equal(resourceFor(alias), resourceFor(canonicalAlias(alias)));
  }
  for (const alias of ['Zed', 'Akali', 'Shen', 'Kennen', 'LeeSin', 'Ambessa', 'Jade_Akali', 'jade_Zed'])
    assert.equal(resourceFor(alias), 'Energy', alias);
  for (const alias of ['Wukong', 'MonkeyKing', 'Jade_Wukong', 'jade_wukong'])
    assert.equal(usesMana(alias), true, alias);
  assert.equal(resourceFor('Jade_Yasuo'), 'Flow');
  assert.equal(usesMana('NewChampionNotYetInCatalog'), null);
});

test('positive mana stats, item tags and variants work with incomplete client categories', () => {
  const game = { items:new Map([
    [3110, {categories:['Armor']}],
    [773042, {categories:['OnHit']}],
    [987601, {categories:['Armor'], stats:{FlatMPPoolMod:150}}],
    [987602, {tags:['SpellDamage','Mana']}],
    [987603, {categories:['Health'], stats:{FlatMPPoolMod:0}}],
  ]) };
  for (const id of [3110, 773040, 773042, 987601, 987602]) {
    assert.equal(itemGivesMana(id,game), true, String(id));
    assert.equal(itemFitsResource(id,game,'Zed'), false, String(id));
    assert.equal(itemFitsResource(id,game,'Orianna'), true, String(id));
  }
  assert.equal(itemGivesMana(987603,game), false);
  const bundled = { items:new Map(items.map(item => [item.id,item])) };
  for (const id of [1004,771004]) assert.equal(itemFitsResource(id,bundled,'Akali'), false);
  for (const id of [1056,3112,3865]) assert.equal(itemFitsResource(id,bundled,'Akali'), true);
});
