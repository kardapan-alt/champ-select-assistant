const test = require('node:test');
const assert = require('node:assert/strict');
const { createReport, readReport } = require('../src/build-report');
const { buildGameData } = require('../src/gamedata');
const { inventoryOf } = require('../src/liveclient');
const draftlab = require('../src/draftlab');
const engine = require('../src/engine');
const game = buildGameData(require('../data/catalog.json'));
const data = require('../data/champions.json');
const player = (alias,isMe=false) => ({isMe,championId:game.championsByAlias.get(alias).id,position:'',puuid:'PRIVATE-PUUID',gameName:'PRIVATE-NICK',tagLine:'PRIVATE-TAG'});

test('raport Zeda zachowuje źródła decyzji, ekwipunek i augment bez tożsamości kont', () => {
  const me = player('Zed',true), enemy=player('Xayah');
  const liveInventory=inventoryOf([{itemID:1036,slot:0,count:1}],game,'Zed','mayhem');
  const items=inventoryOf([{itemID:3031,slot:0,count:1}],game,'Xayah','mayhem').items;
  const state={mode:'mayhem',me,allies:[me,player('Ahri')],enemies:[enemy],choices:{items:[]},
    liveInventory, liveEnemies:[{...enemy,alias:'Xayah',items}], mayhem:{augments:[3088],effects:{},owned:[]}};
  const original=engine.buildFor('Zed',state,game,data);
  const text=JSON.stringify(createReport(state,original,game,{version:'0.6.34',patch:'16.22',gold:247}));
  assert.doesNotMatch(text,/PRIVATE|puuid|tagLine|gameName|matchKey|screenshot/);
  const r=readReport(text), replay=draftlab.preview(r.scenario,game,data);
  assert.equal(r.observed.gold,247);
  assert.equal(r.observed.plan[1].id,original.boots.id);
  assert.deepEqual(r.scenario.mayhem.augments,[3088]);
  assert.deepEqual(r.scenario.context.enemies[0].items,[{itemID:3031,slot:0,count:1}]);
  assert.deepEqual(replay.build.items.map(i=>i.id),original.items.map(i=>i.id));
  assert.equal(replay.build.boots.id,original.boots.id);
});

test('raport oddziela slot questa ADC od sześciu zakupów i odrzuca obcy lub niepełny format', () => {
  const me={...player('Xayah',true),position:'bottom'};
  const state={mode:'classic',me,allies:[me],enemies:[],roleQuestsEnabled:true};
  const b=engine.buildFor('Xayah',state,game,data);
  const r=createReport(state,b,game,{version:'test',patch:null});
  assert.equal(r.observed.plan.length,6);
  assert.equal(r.observed.questSlot.id,b.boots.id);
  assert.deepEqual(draftlab.preview(readReport(JSON.stringify(r)).scenario,game,data).build.items.map(i=>i.id),b.items.map(i=>i.id));
  assert.throws(()=>readReport('{"format":"other"}'));
  assert.throws(()=>readReport(JSON.stringify({...r,scenario:{alias:'Xayah',mode:'classic',role:'bottom'}})));
  assert.throws(()=>readReport(' '.repeat(140000)));
});
