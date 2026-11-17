const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../src/engine'),data=require('../data/champions.json');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const {validateRunes,savedRunes}=require('../src/choices');
const {usesMana,resourceFor,canonicalAlias}=require('../src/champion-identity');
const {mergeStats}=require('../src/opgg');
const {dataFreshness}=require('../src/data-freshness');
const id=a=>game.championsByAlias.get(a).id;
const enemy=(alias,position)=>({championId:id(alias),position});
const state=(alias,position,mode='classic',enemies=[])=>({mode,me:{championId:id(alias),position},allies:[],enemies});
const page=(alias,s,d=data)=>engine.runePageFor(alias,game,d,s);
const cc=['Ahri','Morgana','Ashe','Amumu','Leona'].map(a=>enemy(a));
const airborne=['Yasuo','Yone','Malphite','LeeSin','MonkeyKing'].map(a=>enemy(a));
const tanks=['Ornn','Sion','Leona','Shen','Poppy'].map(a=>enemy(a));

test('426 role/mode pages remain legal and preserve their keystone across 2556 drafts',()=>{
  let pages=0,drafts=0;
  for(const [alias,c] of Object.entries(data.champions)){
    const variants=[...Object.entries(c.runesByRole).map(([role,base])=>({role,mode:'classic',base})),{role:c.roles[0],mode:'aram',base:c.aram.runes}];
    for(const {role,mode,base} of variants){
      pages++;
      for(const enemies of [[],[enemy('Teemo',role)],[enemy('Renekton',role)],cc,airborne,tanks]){
        drafts++;const r=page(alias,state(alias,role,mode,enemies)),label=`${alias} ${role} ${mode}`;
        assert.doesNotThrow(()=>validateRunes(r,game),label);
        assert.equal(r.selectedPerkIds[0],base.perks[0],label);
        assert.equal(r.runeSource.mode,mode,label);
        assert.equal(r.runeSource.position,role,label);
        if(usesMana(alias)===false)assert.ok(!r.selectedPerkIds.includes(8226),label+' Manaflow');
        if(!['Mana','Energy'].includes(resourceFor(alias)))assert.ok(!r.selectedPerkIds.includes(8009),label+' Presence of Mind');
        if(mode==='aram')assert.ok(!r.selectedPerkIds.some(x=>[8137,8141,8232].includes(x)),label+' map');
        if(!enemies.length){assert.deepEqual(r.selectedPerkIds,[...base.perks,...base.shards],label);assert.equal(r.adaptations.length,0,label);}
      }
    }
  }
  assert.equal(pages,426);assert.equal(drafts,2556);
});

test('all five roles use the champion own page or a labelled fallback, never another known champion',()=>{
  for(const [alias,c] of Object.entries(data.champions))for(const role of ['top','jungle','middle','bottom','support']){
    const r=page(alias,state(alias,role)),base=c.runesByRole[role]||c.runes;
    assert.equal(r.keystone.id,base.perks[0],`${alias} ${role}`);
    assert.doesNotThrow(()=>validateRunes(r,game));
    assert.ok(!r.adaptations.some(t=>t.includes('jak u ')));
    if(!c.runesByRole[role])assert.match(r.sourceNote,/Brak danych dla tej roli/);
  }
});

test('Jade variants inherit role and ARAM rune pages',()=>{
  for(const alias of [...game.championsByAlias.keys()].filter(a=>a.startsWith('Jade_'))){
    const normal=canonicalAlias(alias),role=data.champions[normal].roles[0];
    for(const mode of ['classic','aram'])assert.deepEqual(page(alias,state(alias,role,mode)).selectedPerkIds,page(normal,state(normal,role,mode)).selectedPerkIds,alias);
  }
});

test('actual enemy roles win over guessed roles, and ambiguous unseen flex picks do not invent a lane',()=>{
  const s=state('Garen','top','classic',[enemy('Teemo','middle'),enemy('Renekton','top')]);
  const r=page('Garen',s);assert.equal(r.laneOpponent,'Renekton');assert.equal(r.laneInferred,false);
  assert.ok(r.selectedPerkIds.includes(8473));assert.ok(!r.selectedPerkIds.includes(8444));
  s.enemies=[enemy('Teemo'),enemy('Renekton')];
  assert.equal(page('Garen',s).laneOpponent,null);
});

test('bot lane defence responds to the support poke and does not confuse a jungler with a laner',()=>{
  const d=structuredClone(data);d.champions.Leona.runesByRole.support.perks[2]=8473;
  const r=page('Leona',state('Leona','utility','classic',[enemy('Draven','bottom'),enemy('Xerath','utility'),enemy('Teemo','jungle')]),d);
  assert.ok(r.selectedPerkIds.includes(8444));assert.ok(r.adaptations.some(t=>t.includes('Xerath')));
  assert.ok(!r.adaptations.some(t=>t.includes('Teemo')));
  const engage=page('Leona',state('Leona','utility','classic',[enemy('Draven','bottom'),enemy('Nautilus','utility')]),d);
  assert.ok(engage.selectedPerkIds.includes(8473));
});

test('tenacity responds to duration CC rather than knockups or minion-only fear',()=>{
  const neutral=page('Ahri',state('Ahri','middle'));
  assert.equal(page('Ahri',state('Ahri','middle','classic',airborne)).selectedPerkIds[8],neutral.selectedPerkIds[8]);
  assert.equal(page('Ahri',state('Ahri','middle','classic',[enemy('Aatrox'),enemy('Vi'),enemy('Tristana')])).selectedPerkIds[8],neutral.selectedPerkIds[8]);
  const controlled=page('Ahri',state('Ahri','middle','classic',cc));
  assert.equal(controlled.selectedPerkIds[8],5013);assert.ok(controlled.adaptations.some(t=>t.includes('CC skracane')));
});

test('automatic safeguards fix mana, energy, removed and map-inappropriate runes while respecting pinned pages',()=>{
  const raw={p:8100,s:8200,perks:[8112,8143,8138,8106,8226,8232],shards:[5008,5008,5001]};
  const d=structuredClone(data);d.champions.Garen.runes=raw;d.champions.Garen.runesByRole={};d.champions.Garen.aram.runes=raw;
  const s=state('Garen','top','aram'),r=page('Garen',s,d);
  assert.ok(r.selectedPerkIds.includes(8140));assert.ok(r.selectedPerkIds.includes(8275));assert.ok(r.selectedPerkIds.includes(8236));
  for(const alias of ['Garen','Akali']){
    const a=structuredClone(data);a.champions[alias].runesByRole={};
    a.champions[alias].runes={p:8000,s:8400,perks:[8010,8009,9105,8299,8444,8451],shards:[5008,5008,5001]};
    const p=page(alias,state(alias,'top'),a);
    assert.equal(p.selectedPerkIds.includes(8009),alias==='Akali');
  }
  s.choices={runes:{primaryStyleId:8100,subStyleId:8200,selectedPerkIds:[8112,8143,8141,8106,8226,8232,5008,5008,5001]}};
  const own=page('Garen',s,d);assert.deepEqual(savedRunes(own),s.choices.runes);assert.equal(own.pinned,true);
});

test('resource secondary and Last Stand are not discarded by generic defensive rules',()=>{
  const d=structuredClone(data);const native={p:8000,s:8200,perks:[8010,9111,9105,8299,8226,8210],shards:[5008,5008,5001]};
  d.champions.Gragas.runesByRole.top=native;
  const r=page('Gragas',state('Gragas','top','classic',[enemy('Teemo','top'),...tanks]),d);
  assert.equal(r.subStyleId,8200);assert.ok(r.selectedPerkIds.includes(8226));assert.ok(r.selectedPerkIds.includes(8299));
});

test('rune-only live analysis and item-only live analysis do not override each other',()=>{
  const live={p:8200,s:8000,perks:[8229,8226,8210,8237,8009,8017],shards:[5008,5008,5001]};
  const d=mergeStats(data,{analyses:{Ahri:{runes:live}}},game);
  const r=page('Ahri',state('Ahri','middle'),d);assert.deepEqual(r.selectedPerkIds,[...live.perks,...live.shards]);assert.equal(r.runeSource.live,true);
  const items=mergeStats(data,{analyses:{Ahri:{items:[6655,4646,4645]}}},game);
  const aram=page('Ahri',state('Ahri','middle','aram'),items);assert.equal(aram.runeSource.mode,'aram');
  assert.deepEqual(aram.selectedPerkIds,[...data.champions.Ahri.aram.runes.perks,...data.champions.Ahri.aram.runes.shards]);
});

test('Mayhem keeps rune import disabled for every champion and freshness reports rune patch separately',()=>{
  for(const alias of Object.keys(data.champions))assert.equal(page(alias,state(alias,'middle','mayhem')).disabled,true);
  const fresh=dataFreshness({...game,provenance:{version:'16.23.1',source:'client'}},{connected:true,runeSource:data.champions.Ahri.runes.source});
  assert.equal(fresh.rows.find(r=>r.name==='Strona run').status,'different');
});
