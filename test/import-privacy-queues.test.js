const test = require('node:test');
const assert = require('node:assert/strict');
const { writeRunePage } = require('../src/rune-import');
const { readLoadingPlayers, playerCard } = require('../src/players');
const { modeFromFlow } = require('../src/modes');

const body = { name:'CS Assist: Ahri', primaryStyleId:8100, subStyleId:8200, selectedPerkIds:[8112,8126], current:true };
function runeClient() {
  const player = { ...body, id:1, isDeletable:true, name:'CS Assist: moja prywatna strona' };
  const pages = [player], owners = {}, writes = [];
  const lcu = {
    account:'one', fail:0,
    get:async path => path.endsWith('/current-summoner') ? { puuid:lcu.account } : pages,
    request:async (method, path, data) => {
      writes.push([method,path]);
      if (lcu.fail) return { ok:false, status:lcu.fail, data:{message:lcu.fail===400?'Max pages reached':'service unavailable'} };
      if (method==='POST') {
        const page = { ...data, id:100 + pages.length, isDeletable:true };
        pages.push(page);
        return { ok:true, data:page };
      }
      if (method==='PUT' && path.includes('/pages/')) Object.assign(pages.find(p=>p.id===data.id),data);
      return { ok:true };
    },
  };
  return { lcu, owners, writes, pages, player, save:b=>writeRunePage(lcu,b,owners,(id,receipt)=>owners[id]=receipt) };
}
test('bezpieczny import nie modyfikuje strony gracza z podobną nazwą ani przy pełnym limicie, ani po błędzie serwera',async()=>{
  for(const code of [400,503]){
    const s=runeClient(), before=structuredClone(s.pages);
    s.lcu.fail=code;
    await assert.rejects(s.save(body),code===400?/Brak miejsca/:/service unavailable/);
    assert.deepEqual(s.writes,[['POST','/lol-perks/v1/pages']]);
    assert.deepEqual(s.pages,before);
  }
});
test('aktualizacja używa utrwalonego ID tylko dla niezmienionej strony na właściwym koncie',async()=>{
  const s=runeClient(), original=structuredClone(s.player);
  await s.save(body);
  const next={...body,name:'CS Assist: Xayah',selectedPerkIds:[8005,9104]};
  const receipt=JSON.parse(JSON.stringify(s.owners)), owned=s.pages[1];
  owned.current=false;
  await writeRunePage(s.lcu,next,receipt,(key,v)=>s.owners[key]=v);
  assert.deepEqual(s.writes.slice(-2),[['PUT','/lol-perks/v1/pages/'+owned.id],['PUT','/lol-perks/v1/currentpage']]);
  assert.deepEqual(s.pages[0],original);
  s.lcu.fail=503;
  await assert.rejects(s.save(body),/service unavailable/);
  assert.equal(s.writes.at(-1)[0],'PUT');
  s.lcu.fail=0;
  owned.name='Moja własna';
  await s.save(body);
  assert.equal(s.writes.at(-1)[0],'POST');
  s.pages.at(-1).selectedPerkIds=[999];
  await s.save(next);
  assert.equal(s.writes.at(-1)[0],'POST');
  s.lcu.account='two';
  await s.save(body);
  assert.equal(s.writes.at(-1)[0],'POST');
  assert.ok(s.writes.every(([method])=>method!=='DELETE'));
});

test('brak jawnie widocznego Riot ID zachowuje anonimowość nawet z profilem w pamięci',async()=>{
  const me={puuid:'self',gameName:'Ja',tagLine:'PL'};
  const base={puuid:'other',gameName:'Hidden',tagLine:'TEST',championId:1,summonerName:'Other#TEST'};
  const variants=[
    {...base,nameVisibilityType:'HIDDEN',isNameVisible:true}, {...base},
    {...base,nameVisibilityType:'VISIBLE',isRiotIdVisible:false},
    {...base,nameVisibilityType:'VISIBLE',summonerInfo:{privacy:'PRIVATE'}},
    {...base,nameVisibilityType:'VISIBLE',tagLine:''},
    {...base,nameVisibilityType:'FUTURE_MODE'}, {...base,nameVisibilityType:'VISIBLE',isAnonymous:true},
  ];
  const flow={gameData:{teamOne:[{puuid:'self'}],teamTwo:[...variants,{...base, nameVisibilityType:'VISIBLE', gameName:'Public'}]}};
  const refs=[];
  const lcu={get:async path=>{refs.push(path);if(path.endsWith('/session'))return flow;if(path.endsWith('current-summoner'))return me;return {region:'EUNE'};}};
  const r=await readLoadingPlayers(lcu);
  assert.equal(r.allies[0].gameName,'Ja');
  const publicCard=r.enemies.at(-1);
  assert.equal(publicCard.gameName,'Public');assert.equal(publicCard.anonymous,false);
  for(const p of r.enemies.slice(0,-1)){
    assert.deepEqual([p.anonymous,p.gameName,p.tagLine,p.puuid],[true,'','','']);
    const card=playerCard(p,{rank:{tier:'GOLD'}},{});
    assert.equal(card.loaded,false);assert.equal(card.rank,undefined);
    assert.equal(card.name,'Brak publicznego Riot ID');
  }
  assert.equal(refs.length,3);
});
test('wyłącznie rozpoznane kolejki, mapy i reguły uruchamiają rekomendacje',()=>{
  const flow=(id,gameMode,map)=>({map:{id:map},gameData:{queue:{id,gameMode}}});
  for(const wrong of [null,{},flow(null,'CLASSIC',11),flow(7777,'CLASSIC',11),flow(7777,'ARAM',12),flow(450,'BRAWL',12),
    flow(420,'KIWI',11),flow(2400,'KIWI',11),flow(420,'CLASSIC',12),flow(1700,'CHERRY',30),flow(2400,'ARAM',12),flow(0,'',12)])
    assert.equal(modeFromFlow(wrong),'unsupported');
  for(const id of [400,420,440,480,490,700]) assert.equal(modeFromFlow(flow(id,'CLASSIC',11)),'classic');
  for(const id of [450,720,721]) assert.equal(modeFromFlow(flow(id,'ARAM',12)),'aram');
  for(const [id,mode] of [[2400,'KIWI'],[2450,'KIWI_JADE']]) assert.equal(modeFromFlow(flow(id,mode,12)),'mayhem');
});

test('Practice Tool wymaga identyfikatora treningu, trybu gry i mapy Summoner’s Rift',()=>{
  const flow=(id,gameMode,mapId)=>({gameData:{queue:{id,gameMode,mapId}}});
  assert.equal(modeFromFlow(flow(3140,'PRACTICETOOL',11)),'practice');
  assert.equal(modeFromFlow({map:{id:11},gameData:{queue:{id:3140,gameMode:'PRACTICETOOL'}}}),'practice');
  for(const scenario of [flow(3140,'CLASSIC',11),flow(420,'PRACTICETOOL',11),flow(7777,'PRACTICETOOL',11),
    flow(3140,'PRACTICETOOL',12),flow(3140,'PRACTICETOOL',undefined)]){
    assert.equal(modeFromFlow(scenario),'unsupported',JSON.stringify(scenario));
  }
});
