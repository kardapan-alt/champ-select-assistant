const test=require('node:test');
const assert=require('node:assert/strict');
const { LiveClient, inventoryOf, componentCredit }=require('../src/liveclient');
const { MayhemSession, effectiveSelection }=require('../src/mayhem');
const game=require('../src/gamedata').buildGameData(require('../data/catalog.json'));
const engine=require('../src/engine');
const data=require('../data/champions.json');
const item=(itemID,slot=0,extra={})=>({itemID,slot,count:1,consumable:false,...extra});
const me={gameName:'Gracz',tagLine:'EUNE'};
function fixture(items=[]) {
  return {'/liveclientdata/activeplayer':{riotId:'Gracz#EUNE'},
    '/liveclientdata/playerlist':[{riotId:'Wróg#EUNE',rawChampionName:'game_character_displayname_Ahri',items:[item(3031)]},
      {riotId:'Gracz#EUNE',rawChampionName:'game_character_displayname_Ahri',items}],
    '/liveclientdata/gamestats':{gameMode:'KIWI',gameTime:120}};
}
const read=responses=>new LiveClient(async p=>responses[p]).inventory(me,'Ahri','KIWI',game);

test('odczyt wybiera własny Riot ID i championa, także przy lustrzanym przeciwniku',async()=>{
  const value=await read(fixture([item(6655),item(3020,1)]));
  assert.equal(value.status,'live');assert.deepEqual(value.inventory.owned,[6655]);assert.equal(value.inventory.ownedBoots,3020);
  for(const [path,value] of [['/liveclientdata/activeplayer',{riotId:'Wróg#EUNE'}],['/liveclientdata/gamestats',{gameMode:'ARAM',gameTime:120}]]){
    const f=fixture();f[path]=value;assert.equal((await read(f)).status,'mismatch');
  }
  const f=fixture();f['/liveclientdata/playerlist'][1].rawChampionName='game_character_displayname_Lux';
  assert.equal((await read(f)).status,'mismatch');
  const dup=fixture();dup['/liveclientdata/playerlist'].push(dup['/liveclientdata/playerlist'][1]);
  assert.equal((await read(dup)).status,'mismatch');
});

test('pusty ekwipunek jest poprawnym odczytem, a brak danych nie oznacza sprzedaży',async()=>{
  assert.deepEqual((await read(fixture())).inventory.owned,[]);
  assert.equal((await read({})).status,'waiting');
  const f=fixture();delete f['/liveclientdata/playerlist'][1].items;
  assert.equal((await read(f)).status,'invalid');
  assert.equal(inventoryOf([item(6655),item(3089)],game,'Ahri'),null);
  assert.equal(inventoryOf([item('6655')],game,'Ahri'),null);
  assert.equal(inventoryOf([{itemID:6655}],game,'Ahri'),null);
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
