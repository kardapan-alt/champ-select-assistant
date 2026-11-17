const test = require('node:test');
const assert = require('node:assert/strict');
const { MayhemFavorites } = require('../src/mayhem-favorites');
const match = {
  key:'local-session',owner:'PRIVATE-OWNER',name:'Zed',alias:'Zed',mode:'mayhem',reason:'ended',
  augments:[{id:3088,name:'SZKARŁATNY KOBALT'}],headliner:{id:'pentakill',name:'Pentakill',ability:'Q'},
  items:[{id:3031,name:'Infinity Edge',count:1},{id:1036,name:'Long Sword',count:2}],
  build:[{id:3078,name:'NOT-PURCHASED'}]
};
test('ulubione zachowują kombinację i notatkę po usunięciu meczu z historii i po restarcie', () => {
  let disk;
  const library = new MayhemFavorites([],next=>{disk=JSON.stringify(next);});
  const original = structuredClone(match);
  const saved = library.add(original);
  assert.ok(saved.added);
  library.note(saved.id,'  Spróbować ponownie.  ');
  original.items.reverse();
  assert.deepEqual(library.add({...original,key:'other-session'}),{id:saved.id,added:false});
  original.items=[]; original.augments=[]; original.headliner=null;
  assert.doesNotMatch(disk,/PRIVATE|local-session|NOT-PURCHASED/);
  const restored = new MayhemFavorites(JSON.parse(disk));
  const [entry] = restored.list();
  assert.equal(entry.note,'Spróbować ponownie.');
  assert.equal(entry.headliner.ability,'Q');
  assert.equal(entry.augments[0].english,'CRIMSON COBALT');
  assert.equal(entry.items[0].polish,'Ostrze Nieskończoności');
  assert.deepEqual(entry.items.map(i=>i.count),[1,2]);
  assert.equal(entry.incomplete,false);
  restored.remove(saved.id); assert.deepEqual(restored.list(),[]);
});

test('starszy i niepełny zapis Mayhem zachowuje tylko zaobserwowane dane', () => {
  const lib = new MayhemFavorites();
  assert.throws(()=>lib.add({...match,mode:'aram'}));
  assert.throws(()=>lib.add({...match,items:[],augments:[]}));
  const saved=lib.add({...match,headliner:null,augments:[],reason:'left',items:[{id:999999,name:'Stary przedmiot'}]});
  const [entry]=lib.list();
  assert.equal(entry.incomplete,true); assert.deepEqual(entry.augments,[]); assert.equal(entry.items[0].name,'Stary przedmiot');
  assert.throws(()=>lib.note(saved.id,'x'.repeat(401)));
  assert.throws(()=>lib.note('inny','x'));
  assert.ok(lib.add({...match,headliner:{...match.headliner,ability:'R'}}).added);
  assert.ok(lib.add(match).added);
  assert.equal(lib.list().length,3);
});

test('błąd zapisu nie zmienia ulubionych w pamięci', () => {
  let fails=false;
  const lib=new MayhemFavorites([],()=>{if(fails)throw Error('Brak miejsca');});
  const saved=lib.add(match);fails=true;
  assert.throws(()=>lib.note(saved.id,'x'),/Brak miejsca/);
  assert.throws(()=>lib.remove(saved.id),/Brak miejsca/);
  assert.equal(lib.list()[0].note,'');
});
