const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGameData } = require('../src/gamedata');
const { laneVariantOptions, compareLaneVariants } = require('../src/lane-variants');
const { runePageFor } = require('../src/engine');
const data = require('../data/champions.json');
const game = buildGameData(require('../data/catalog.json'));
const id = alias => game.championsByAlias.get(alias).id;
const player = (alias,position='',locked=true) => ({championId:id(alias),position,locked});
const options = (state,queue=420) => laneVariantOptions(state,queue,game,data);
const compare = (state,ids) => compareLaneVariants(state,420,game,data,ids);

function solo() {
  const me={...player('Garen','top',false),isMe:true};
  return {mode:'classic',me,allies:[me],enemies:[player('Teemo'),player('Darius')]};
}

test('two top/jungle assignments compare actual recommendations and leave the draft untouched',()=>{
  const state=solo(),saved=structuredClone(state);
  const view=options(state);
  assert.equal(view.options.length,2);
  const ids=[id('Teemo'),id('Darius')].map(String);
  const rows=compare(state,ids);
  const component=rows.find(row=>row.title.includes('Komponent'));
  assert.deepEqual(component.values.map(lines=>lines[0]),[data.earlyDefense.ap,data.earlyDefense.ad].map(i=>game.items.get(i).name));
  assert.ok(rows.some(row=>row.title==='Runy'),'poke and all-in change the page');
  assert.ok(rows.some(row=>row.title==='Plan linii'));
  assert.equal(rows.find(row=>row.title==='Pierwszy przedmiot'),undefined);
  for (const row of rows) assert.notDeepEqual(row.values[0],row.values[1]);
  assert.deepEqual(state,saved);
  assert.deepEqual(compare(state,ids.reverse()),rows.map(row=>({...row,values:[row.values[1],row.values[0]]})));
  state.choices={runes:runePageFor('Garen',game,data,state)};
  assert.ok(!compare(state,ids).some(row=>row.title==='Runy'),'pinned page stays pinned');
});

test('one revealed flex can change lane; hidden enemies and enemy hovers supply no evidence',()=>{
  const state=solo();
  state.enemies=[player('Teemo'),player('Jax','',false),{position:'',locked:false,championId:0}];
  const view=options(state);
  assert.deepEqual(view.options.map(o=>o.id),[String(id('Teemo')),'0']);
  assert.ok(!JSON.stringify(view).includes('Jax'));
  const tips=compare(state,view.options.map(o=>o.id)).find(r=>r.title==='Plan linii');
  assert.ok(tips.values[1].some(t=>t.includes('nieznany')));
  state.enemies[0].position='JUNGLE';
  assert.equal(options(state),null);
  assert.throws(()=>compare(state,view.options.map(o=>o.id)),/zmieniły/);
});

test('both bot roles can compare Lux mid against Lux support with the same opposing ADC',()=>{
  const allies=[player('Xayah','bottom'),player('Leona','utility')];
  const enemies=[player('Caitlyn','bottom'),player('Lux')];
  for(const me of allies) {
    const state={me:{...me,isMe:true},mode:'classic',allies,enemies};
    const view=options(state);
    assert.equal(view.options.length,2);
    assert.ok(view.options.some(o=>o.label==='Mid · Lux'));
    assert.ok(view.options.some(o=>o.label==='Support · Lux'));
    const plan=compare(state,view.options.map(o=>o.id)).find(row=>row.title==='Plan linii');
    assert.match(plan.values[0].join(' '),/Lux.*Caitlyn.*pułapkę/);
    assert.match(plan.values[1].join(' '),/brakuje wyboru supporta/);
  }
});

test('only solo queue drafts with a relevant ambiguous matchup are eligible',()=>{
  const s=solo();
  for(const queue of [0,400,440,450,2400]) assert.equal(options(s,queue),null);
  for(const mode of ['aram','mayhem']) assert.equal(options({...s,mode}),null);
  for(const me of [null,{championId:0,position:'top'},player('Garen','jungle')]) assert.equal(options({...s,me}),null);
  assert.equal(options({...s,enemies:[player('Lux'),player('Caitlyn')]}),null);
  assert.equal(options({...s,enemies:[player('Teemo','top'),player('Jax')]}),null);
  assert.throws(()=>compare(s,['0','0']),/różne/);
  assert.throws(()=>compare(s,['','5']),/zmieniły/);
});
