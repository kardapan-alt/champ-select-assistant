const test=require('node:test');
const assert=require('node:assert/strict');
const { LiveClient, inventoryOf, componentCredit }=require('../src/liveclient');
const { MayhemSession, effectiveSelection }=require('../src/mayhem');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const engine=require('../src/engine');
const data=require('../data/champions.json');
const item=(itemID,slot=0,extra={})=>({itemID,slot,count:1,consumable:false,...extra});
const me={gameName:'Gracz',tagLine:'EUNE'};
test('wynik Live Client jest odczytywany dopiero po weryfikacji własnego gracza',async()=>{
  const f=fixture();f.events={Events:[{EventName:'GameEnd',EventTime:f.gameData.gameTime,Result:'Win'}]};
  assert.equal((await read(f)).outcome,'win');
  f.activePlayer.riotId='Wróg#EUNE';assert.equal((await read(f)).outcome,undefined);
});
function fixture(items=[]) {
  return {activePlayer:{riotId:'Gracz#EUNE',currentGold:1234.8},
    allPlayers:[{riotId:'Wróg#EUNE',team:'CHAOS',rawChampionName:'game_character_displayname_Ahri',items:[item(3031)]},
      {riotId:'Gracz#EUNE',team:'ORDER',rawChampionName:'game_character_displayname_Ahri',items}],
    gameData:{gameMode:'KIWI',gameTime:120}};
}
const read=responses=>new LiveClient(async p=>{assert.equal(p,'/liveclientdata/allgamedata');return responses;})
  .inventory(me,'Ahri','KIWI',game,{enemies:[{gameName:'Wróg',tagLine:'EUNE',championId:103}]});

test('trening bez wrogów jest potwierdzony dopiero gdy oba składy są zgodne',async()=>{
  const snapshot=fixture();
  const opponent=snapshot.allPlayers.shift();
  snapshot.gameData.gameMode='PRACTICETOOL';
  const client=new LiveClient(async()=>snapshot);
  const sample=(enemies)=>client.inventory(me,'Ahri','PRACTICETOOL',game,{mode:'practice',enemies});
  assert.deepEqual((await sample([])).enemies,[]);
  assert.equal((await sample(undefined)).enemies,null);
  snapshot.allPlayers.push(opponent);
  const unconfirmed=await sample([]);
  assert.equal(unconfirmed.enemies,null);
  assert.equal(unconfirmed.gold,1234);
  assert.equal((await sample([{anonymous:true,championId:103}])).enemies[0].items[0].id,3031);
  snapshot.gameData.gameMode='CLASSIC';
  assert.equal((await sample([])).status,'mismatch');
});

test('tablica meczu rozróżnia drużyny i nie ujawnia kont anonimowych przeciwników', async()=>{
  const f=fixture();
  f.allPlayers[0].scores={kills:3,deaths:2,assists:1,creepScore:20};
  f.allPlayers[1].scores={kills:0,deaths:0,assists:0};
  const options={allies:[{...me,championId:103}],enemies:[{anonymous:true,championId:103}]};
  const live=new LiveClient(async()=>f);
  const scores=async()=> (await live.inventory(me,'Ahri','KIWI',game,options)).scoreboard;
  assert.deepEqual(await scores(),{allies:{103:{kda:[0,0,0],cs:null}},enemies:{103:{kda:[3,2,1],cs:20}}});
  f.allPlayers[0].scores={creepScore:0,kills:null,deaths:0,assists:2};
  assert.deepEqual((await scores()).enemies[103],{kda:null,cs:0});
  f.allPlayers.push({...f.allPlayers[0]});
  assert.deepEqual((await scores()).enemies,{});
  f.allPlayers.pop();delete f.allPlayers[0].scores;
  assert.deepEqual((await scores()).enemies,{});
  f.allPlayers[0].scores={kills:1,deaths:0,assists:2};
  options.enemies=[{championId:103,gameName:'Inny',tagLine:'TEST'}];
  assert.deepEqual((await scores()).enemies,{});
  f.activePlayer.riotId='Inny#TEST';
  assert.equal(await scores(),undefined);
});

test('odczyt wybiera własny Riot ID i championa, także przy lustrzanym przeciwniku',async()=>{
  const value=await read(fixture([item(6655),item(3020,1)]));
  assert.equal(value.status,'live');assert.deepEqual(value.inventory.owned,[6655]);assert.equal(value.inventory.ownedBoots,3020);
  assert.equal(value.gold,1234);assert.equal(value.enemies[0].items[0].id,3031);
  for(const [path,value] of [['activePlayer',{riotId:'Wróg#EUNE'}],['gameData',{gameMode:'ARAM',gameTime:120}]]){
    const f=fixture();f[path]=value;assert.equal((await read(f)).status,'mismatch');
  }
  const f=fixture();f.allPlayers[1].rawChampionName='game_character_displayname_Lux';
  assert.equal((await read(f)).status,'mismatch');
  const dup=fixture();dup.allPlayers.push(dup.allPlayers[1]);
  assert.equal((await read(dup)).status,'mismatch');
});

test('pusty ekwipunek jest poprawnym odczytem, a brak danych nie oznacza sprzedaży',async()=>{
  assert.deepEqual((await read(fixture())).inventory.owned,[]);
  assert.equal((await read({})).status,'waiting');
  const f=fixture();delete f.allPlayers[1].items;
  assert.equal((await read(f)).status,'invalid');
  assert.equal(inventoryOf([item(6655),item(3089)],game,'Ahri'),null);
  assert.equal(inventoryOf([item('6655')],game,'Ahri'),null);
  assert.equal(inventoryOf([{itemID:6655}],game,'Ahri'),null);
});

test('niepewny skład wroga wyłącza jego analizę, a brak złota nie oznacza zera',async()=>{
  for(const mutate of [f=>{f.allPlayers[0].team='ORDER';},f=>{f.allPlayers[0].riotId='Inny#EUNE';},
    f=>{f.allPlayers[0].rawChampionName='game_character_displayname_Lux';},f=>{f.allPlayers[0].items=null;},
    f=>{f.allPlayers.push({...f.allPlayers[0]});}]){
    const f=fixture();mutate(f);const r=await read(f);assert.equal(r.status,'live');assert.equal(r.enemies,null);
  }
  for(const gold of [undefined,NaN,-1,'800']){const f=fixture();f.activePlayer.currentGold=gold;assert.equal((await read(f)).gold,null);}
  const f=fixture();f.activePlayer.currentGold=0;assert.equal((await read(f)).gold,0);
  assert.equal(JSON.stringify((await read(f)).enemies).includes('EUNE'),false,'Brak nazw kont w przekazywanym ekwipunku');
});

test('oba klucze nazwy championa z Live Client zachowują weryfikację konta i składu',async()=>{
  for(const ownName of ['game_character_displayname_Ahri','Character_Ahri_Name']){
    for(const enemyName of ['game_character_displayname_Ahri','Character_Ahri_Name']){
      const f=fixture();f.allPlayers[1].rawChampionName=ownName;f.allPlayers[0].rawChampionName=enemyName;
      const result=await read(f);assert.equal(result.status,'live');assert.equal(result.enemies.length,1);
    }
  }
  for(const name of ['Character_Lux_Name','Character_Ahri_Name_extra','Ahri','Character__Name',null]){
    const f=fixture();f.allPlayers[0].rawChampionName=name;assert.equal((await read(f)).enemies,null);
    f.allPlayers[1].rawChampionName=name;assert.equal((await read(f)).status,'mismatch');
  }
  const f=fixture();f.allPlayers[0].rawChampionName='Character_Ahri_Name';f.allPlayers[0].riotId='Inny#EUNE';
  assert.equal((await read(f)).enemies,null);
});

test('Trundle przeciw trzem zakupionym buildom pod kryty dostaje Randuina jako następny cel',async()=>{
  const {shopPlan}=require('../src/shop-plan');
  const enemies=[['Ezreal',[3042,3158,3508,6676,3033,3003]],['Aatrox',[3031,3036,3095,6676,1053,3111]],
    ['Sett',[3084,3111,3083,2504,2501]],['Xayah',[3032,3006,6675,3031,3153,1043]],['Xerath',[6655,3135,3020,4645,3089,4628]]];
  const expected=enemies.map(([alias],i)=>({gameName:'Enemy'+i,tagLine:'TEST',championId:game.championsByAlias.get(alias).id}));
  for(const mode of ['aram','mayhem'])for(const owned of [[3078,3047],[3078,3047,223069,3053,6609]]){
    const snapshot={activePlayer:{riotId:'Gracz#EUNE',currentGold:3000},gameData:{gameMode:mode==='aram'?'ARAM':'KIWI',gameTime:1000},allPlayers:[
      {riotId:'Gracz#EUNE',team:'ORDER',rawChampionName:'game_character_displayname_Trundle',items:owned.map((id,slot)=>item(id,slot))},
      ...enemies.map(([alias,ids],i)=>({riotId:`Enemy${i}#TEST`,team:'CHAOS',rawChampionName:alias==='Aatrox'?'Character_Aatrox_Name':`game_character_displayname_${alias}`,items:ids.map((id,slot)=>item(id,slot))}))]};
    const result=await new LiveClient(async()=>snapshot).inventory(me,'Trundle',snapshot.gameData.gameMode,game,{mode,enemies:expected});
    assert.equal(result.enemies.length,5);
    const state={mode,me:{championId:48},allies:[],enemies:expected,liveInventory:result.inventory,liveEnemies:result.enemies,
      ...(mode==='mayhem'?{mayhem:{augments:[],effects:{},completed:[],owned:result.inventory.owned,ownedBoots:result.inventory.ownedBoots}}:{})};
    const build=engine.buildFor('Trundle',state,game,data);
    const response=build.liveAdaptation.find(s=>s.item===3143);
    assert.deepEqual(response.evidence.map(e=>e.name).sort(),['Aatrox','Ezreal','Xayah']);
    assert.equal(build.items.find(i=>!i.owned).id,3143);
    assert.equal(shopPlan(build,result,game,result.status).target.id,3143);
    assert.ok(result.inventory.owned.every(id=>build.items.some(i=>i.id===id&&i.owned)));
  }
});

test('boczne buty ADC tylko przy potwierdzonym slocie i właściwej roli',()=>{
  const items=[item(3031),item(3006,7),item(3340,6)];
  assert.equal(inventoryOf(items,game,'Ashe','classic',true).ownedBoots,3006);
  assert.equal(inventoryOf(items,game,'Ashe','classic',false).ownedBoots,null);
  assert.equal(inventoryOf([item(3006,5)],game,'Ashe','classic',true).items[0].slot,5);
});

test('komponenty, podstawowe buty i mikstury nie są przypinane jako gotowe itemy',()=>{
  const inv=inventoryOf([item(2420),item(1001,1),item(1058,2),item(2031,3),item(6655,4),item(3340,6)],game,'Ahri');
  assert.deepEqual(inv.owned,[6655]);assert.equal(inv.ownedBoots,null);
  assert.deepEqual(inv.items.map(i=>i.kind),['component','component','component','consumable','finished']);
  assert.equal(componentCredit(3157,inv,game),2800);
  assert.equal(componentCredit(3089,inv,game),1200,'Jeden rod nie może pokryć dwóch elementów receptury');
});

test('ulepszenia, nagrody, kopie i nieznany nowy item pozostają w odczycie',()=>{
  const inv=inventoryOf([item(3040),item(228002,1),item(773071,2),item(773071,3),item(999999,4,{displayName:'Nowość'}),item(3020,5)],game,'Ahri');
  assert.deepEqual(inv.owned,[3040,228002,773071,773071]);
  assert.equal(inv.items[4].kind,'unknown');assert.equal(inv.items[4].name,'Nowość');
});

test('sesja zachowuje augmenty i korekty, reaguje na sprzedaż, nie zapisuje identycznych odczytów',()=>{
  let writes=0;const s=new MayhemSession(null,()=>writes++);const key=s.ensure(12,'Ahri').key;
  s.set(key,{augments:[1002],completed:[],effects:{1002:['onhit']},owned:[3089],ownedBoots:null});
  const inv=inventoryOf([item(6655),item(3020,1)],game,'Ahri');
  assert.equal(s.setInventory(key,inv),true);const count=writes;
  assert.equal(s.setInventory(key,inv),false);assert.equal(writes,count);
  assert.deepEqual(effectiveSelection(s.value).owned,[6655]);assert.deepEqual(effectiveSelection(s.value).effects,{1002:['onhit']});
  s.setAutoInventory(key,false);assert.deepEqual(effectiveSelection(s.value).owned,[3089]);
  s.setInventory(key,inventoryOf([],game,'Ahri'));assert.deepEqual(effectiveSelection(s.value).owned,[3089]);
  s.setAutoInventory(key,true);assert.deepEqual(effectiveSelection(s.value).owned,[]);
  const restored=new MayhemSession(JSON.parse(JSON.stringify(s.value)));restored.ensure(12,'Ahri');
  assert.deepEqual(effectiveSelection(restored.value).augments,[1002]);
  s.ensure(13,'Ahri');assert.equal(s.setInventory(key,inv),false);assert.equal(s.value.inventory,undefined);
});

test('sześć gotowych itemów po sprzedaży butów nie tworzy siódmego slotu ani zakupu butów',()=>{
  const inventory=inventoryOf([6655,3089,3157,3135,3116,3040].map((id,slot)=>item(id,slot)),game,'Ahri');
  const s=new MayhemSession();const key=s.ensure(10,'Ahri').key;s.setInventory(key,inventory);
  const state={mode:'mayhem',me:{championId:103},allies:[],enemies:[],mayhem:effectiveSelection(s.value),liveInventory:inventory};
  const b=engine.buildFor('Ahri',state,game,data);
  assert.equal(b.inventory.bootsSlot,'none');assert.equal(b.items.length,6);assert.ok(b.items.every(i=>i.owned));assert.equal(b.mayhem.nextItem,null);
  const set=engine.itemSetFor(b,'Ahri',state,game,data);
  assert.ok(!set.blocks.some(block=>block.items.some(i=>Number(i.id)===b.boots.id)));
});

test('już kupione kopie nie znikają z planu przed ręcznym zaznaczeniem augmentu',()=>{
  const inventory=inventoryOf([item(773071),item(773071,1),item(3047,2)],game,'Garen');
  const state={mode:'mayhem',me:{championId:86},allies:[],enemies:[],mayhem:{augments:[],owned:inventory.owned,ownedBoots:inventory.ownedBoots},liveInventory:inventory};
  const b=engine.buildFor('Garen',state,game,data);
  assert.equal(b.items.filter(i=>i.id===773071&&i.owned).length,2);
  assert.equal(b.items.filter(i=>i.id===773071).length,2);
});
