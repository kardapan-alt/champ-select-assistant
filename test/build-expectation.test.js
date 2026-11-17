const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeExpectation,checkExpectation} = require('../src/build-expectation');
const {ReplayLibrary} = require('../src/replay-checks');
const {readReport} = require('../src/build-report');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const fixture = require('./fixtures/reported-builds/zed.json');
const items = [{id:1,name:'A'},{id:2,name:'B'},{id:3,name:'C'}];
const game = {items:new Map(items.map(i=>[i.id,i]))};
const check = (kind,itemId,plan,side=null,prerequisiteId) =>
  checkExpectation({kind,itemId,prerequisiteId},plan,side,game).passed;

test('warunek obecności sprawdza również boczny slot i wymaga przedmiotu z katalogu',()=>{
  assert.equal(check('include',3,items.slice(0,2),items[2]),true);
  assert.equal(check('exclude',3,items.slice(0,2)),true);
  assert.equal(check('exclude',1,items),false);
  assert.equal(check('include',2,[]),false);
  assert.equal(check('exclude',777,items),false);
});
test('opcjonalny zakup musi nastąpić po wskazanym poprzedniku',()=>{
  assert.equal(check('after',2,items,null,1),true);
  assert.equal(check('after',2,[items[1]],null,1),false);
  assert.equal(check('after',2,[items[1],items[0]],null,1),false);
  assert.equal(check('after',2,[],null,1),true);
  assert.equal(check('after',2,[items[0]],items[1],1),false);
});
test('stare zgłoszenia i różne oczekiwania dla tego samego przypadku zostają w bibliotece',()=>{
  const {expectation,...legacy}=fixture, store=new ReplayLibrary([],()=>{});
  assert.equal(normalizeExpectation(undefined),null);
  assert.equal(readReport(JSON.stringify(legacy)).expectation,undefined);
  for (const bad of [{kind:'code',itemId:1},{kind:'include',itemId:'1'},{kind:'after',itemId:2,prerequisiteId:2}])
    assert.throws(()=>readReport(JSON.stringify({...legacy,expectation:bad})));
  store.add(legacy);store.add(fixture);store.add({...legacy,expectation:{kind:'include',itemId:3142}});
  store.add({...legacy,expectation});
  assert.equal(store.entries.length,3);
});

test('polecenie używane przed wydaniem zwraca błąd dla niespełnionego zgłoszenia', t=>{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'csa-test-report-'));
  t.after(()=>fs.rmSync(directory,{force:true,recursive:true}));
  const file = path.join(directory,'zed.json');
  fs.writeFileSync(file,JSON.stringify({...fixture,expectation:{kind:'include',itemId:3124}}));
  const run = spawnSync(process.execPath,[path.join(__dirname,'../scripts/check-build-reports.js'),file],{encoding:'utf8'});
  assert.equal(run.status,1);
  assert.match(run.stderr,/Zed.*Guinsoo/);
});
