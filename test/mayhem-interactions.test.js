const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../data/mayhem-augments.json').augments;
const evidence = require('../data/mayhem-rule-evidence.json');
const data = require('../data/champions.json');
const game = require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const { champInfo, buildFor } = require('../src/engine');
const { itemInteraction } = require('../src/mayhem-interactions');
const { adaptation } = require('../src/mayhem');
const { compareAugments } = require('../src/mayhem-compare');
const find = key => catalog.find(a => a.api.replace(/^ARAM_/,'') === key);

test('każde ulepszenie przedmiotu i zadanie ma opis ze źródłem dla właściwego patcha', () => {
  const newer = {...game, provenance:{version:'16.23.12+1'}};
  for (const a of catalog.filter(a => /(?:Upgrade|Quest)_/.test(a.api))) {
    const record = itemInteraction(a, {}, newer);
    assert.ok(record?.mechanic, a.api);
    assert.equal(record.descriptionKey, evidence.augments[a.api].description);
    assert.equal(record.patch,'16.22');
    assert.equal(record.otherPatch,'16.23');
  }
  assert.equal(itemInteraction(find('Deft'),{},game),null);
  assert.equal(itemInteraction(find('Upgrade_Stormsurge'),{},game).otherPatch,null);
});

test('ta sama mechanika przy wybranej karcie i ofercie, bez fikcyjnych premii zakupowych dla Crimson Cobalt', () => {
  const c = champInfo('Zed',game,data), id = find('CrimsonCobalt').id;
  const state = {mode:'mayhem',me:{championId:game.championsByAlias.get('Zed').id},allies:[],enemies:[]};
  const baseline = buildFor('Zed',state,game,data);
  const selected = buildFor('Zed',{...state,mayhem:{augments:[id]}},game,data);
  const offerIds = ['Upgrade_SunderedSky','CrimsonCobalt','Nightstalking'].map(k => find(k).id);
  const offer = compareAugments(offerIds,{champion:c,game,build:baseline}).cards[1];
  assert.deepEqual(selected.mayhem.hints[0].interaction,offer.interaction);
  assert.match(offer.interaction.mechanic,/Q Zeda/);
  assert.match(offer.interaction.purchase,/Guinsoo/);
  assert.equal(offer.status,'independent');
  assert.deepEqual(selected.items.map(it=>it.id), baseline.items.map(it=>it.id));
  assert.equal(adaptation({augments:[id]},c,{game}).bonuses.size,0);
  assert.doesNotMatch(itemInteraction(find('CrimsonCobalt'),{},game).mechanic,/\bQ\b/);
});

test('premie dla umiejętności nakładających on-hit odnoszą się do faktycznego efektu na przedmiocie', () => {
  for (const name of ['EtherealWeapon','BEES','DoubleStrike']) {
    const a = find(name);
    for (const alias of ['Ahri','Zed']) {
      const {bonuses,hints} = adaptation({augments:[a.id]},champInfo(alias,game,data),{game});
      const ids = hints[0].interaction.examples.map(item=>item.id);
      for (const id of bonuses.keys())assert.ok(ids.includes(id),name+' '+id);
      assert.ok(bonuses.has(alias==='Ahri'?3115:3153));
      assert.ok(!bonuses.has(3124),'Karta nie daje dodatkowych premii za wielokrotne ataki Guinsoo');
    }
  }
});
