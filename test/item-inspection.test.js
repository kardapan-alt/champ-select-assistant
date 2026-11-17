const test = require('node:test');
const assert = require('node:assert/strict');
const { preview, inspectionCatalog } = require('../src/draftlab');
const game = require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const data = require('../data/champions.json');
const xayah={alias:'Xayah',role:'bottom',mode:'classic',enemies:['Ornn','Amumu','Malphite','Jhin','Soraka']};
const zed={alias:'Zed',role:'middle',mode:'mayhem',enemies:[]};
const inspect=(scenario,id)=>preview(scenario,game,data,{inspectItem:id}).inspection;

test('tester pokazuje rzeczywiste źródło Trinity na Zedzie i hipotetyczny zakup bez zmiany stanu',()=>{
  const input={...zed,mayhem:{augments:[3088]}};
  const before=structuredClone(input),out=inspect(input,3078);
  assert.equal(out.considered,false);assert.ok(out.trial.after.some(i=>i.id===3078));
  assert.equal(out.trial.before.some(i=>i.id===3078),false);
  assert.deepEqual(input,before);
  const direct=inspect({...zed,mayhem:{augments:[1996]}},3078);
  assert.equal(direct.selected,true);assert.match(direct.reason,/augment.*Blasku/i);
});

test('wyłączność, przypięte miejsca, zakupione przedmioty i buty w slocie questa są zachowane',()=>{
  const result=inspect(xayah,3036);
  assert.match(result.reason,/Mortal Reminder/);assert.equal(result.trial.replaced,'Mortal Reminder');
  assert.equal(result.trial.after.filter(i=>!i.side).length,6);
  assert.equal(result.trial.after[1].side,true);
  assert.ok(!result.trial.after.some(i=>i.id===3033));
  const base=preview(xayah,game,data,{buildOnly:true}).build;
  assert.equal(inspect(xayah,base.boots.id).side,true);
  const item=base.items.find(i=>i.id===3033);
  assert.match(inspect({...xayah,choices:{items:[{slot:item.slot,id:item.id}]}},3036).trial.blocked,/Mortal Reminder/);
  assert.match(inspect({...xayah,context:{inventory:[{itemID:3033,slot:0,count:1}]}},3036).trial.blocked,/Mortal Reminder/);
  const all=base.items.map(i=>({slot:i.slot,id:i.id}));
  assert.match(inspect({...xayah,choices:{items:all}},3046).trial.blocked,/Każdy slot/);
});

test('wyjaśnienia zachowują ograniczenia sklepów, faktyczny ranking oraz nazwy PL/EN',()=>{
  assert.match(inspect(zed,3040).reason,/Archangel/);
  assert.equal(inspect(zed,223031).trial,undefined);
  assert.match(inspect({...zed,alias:'Ornn'},3143).reason,/porównaniu.*priorytet|porównaniu.*wynik/);
  const onhit=inspect({...xayah,alias:'Vayne',enemies:[]},3031);
  assert.match(onhit.reason,/kryty/);
  assert.throws(()=>inspect(zed,'3031'),/katalogu/);
  const options=inspectionCatalog(game);
  assert.equal(options.find(i=>i.id===3031).polish,'Ostrze Nieskończoności');
  assert.equal(options.find(i=>i.id===3031).english,'Infinity Edge');
  assert.ok(options.some(i=>i.id===223031));
});
