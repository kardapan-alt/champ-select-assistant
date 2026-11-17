// Pełny main + prawdziwy LiveClient/parser + renderer; lokalne dane symulowane.
const {app}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../../shop-preview'),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);app.disableHardwareAcceleration();
const oldBase=structuredClone(require('../data/champions.json'));
oldBase.version=6;oldBase.champions.Ahri.items=[3078,3053,6333];
fs.writeFileSync(path.join(profile,'champions.json'),JSON.stringify(oldBase));
for(const [file,value] of Object.entries({'settings.json':{stats:false,autoRunes:false,autoItemSet:false,autoPopup:false,launchAtLogin:false,keyboardShortcut:''},'choices.json':{},'next-purchase.json':null,'mayhem-session.json':null,'augment-screen.json':null,'match-review.json':{matches:[],active:null}}))fs.writeFileSync(path.join(profile,file),JSON.stringify(value));
process.argv.push('--background');process.env.PORT='0';process.env.STEP='8';
const server=require('../mock/mock-lcu');
require('../src/augment-screen').gameWindowHandle=async()=>null;
const {LcuClient}=require('../src/lcu'),{LiveClient}=require('../src/liveclient');
const catalog=require('../data/catalog.json');
let win,mode='KIWI',gameId=870,gold=1000,ownItems=[6655,3020,1026],enemyItems=[4401,3111],connected=true,pending=null,requests=0;
let flow,champions=[],flowFailure=false,enemyReadFailure=false,phaseOverride=null,endReady=false,currentSummoner;
const originalGet=LcuClient.prototype.get,readInventory=LiveClient.prototype.inventory;
LcuClient.prototype.get=async function(url){
  if(url==='/lol-patch/v1/game-version')return '16.22.8348910+branch.test';
  if(url==='/lol-end-of-game/v1/eog-stats-block')return endReady?{gameId,localPlayer:{puuid:currentSummoner.puuid,championId:flow.gameData.teamOne.find(p=>p.puuid===currentSummoner.puuid).championId,stats:{WIN:1}}}:null;
  if(phaseOverride&&url==='/lol-gameflow/v1/gameflow-phase')return phaseOverride;
  if(flowFailure && url==='/lol-gameflow/v1/session')return null;
  if(url.endsWith('/items.json'))return catalog.items;
  const value=await originalGet.call(this,url);
  if(url==='/lol-summoner/v1/current-summoner')currentSummoner=value;
  if(url.endsWith('/champion-summary.json'))champions=value;
  if(url==='/lol-gameflow/v1/session'&&value){value.gameData.queue.gameMode=mode;value.map.id=mode==='CLASSIC'?11:12;value.gameData.queue.id=mode==='CLASSIC'?420:450;value.gameData.gameId=gameId;flow=value;}
  return value;
};
LiveClient.prototype.inventory=async function(...args){
  return readInventory.call({read:async endpoint=>{
    assert.equal(endpoint,'/liveclientdata/allgamedata');requests++;
    const snapshot=connected?{activePlayer:{riotId:'Daniel#EUNE',currentGold:gold},gameData:{gameMode:mode,gameTime:300},
      allPlayers:[...flow.gameData.teamOne.map(p=>({...p,team:'ORDER'})),...flow.gameData.teamTwo.map(p=>({...p,team:'CHAOS'}))].map(p=>({
        riotId:`${p.gameName}#${p.tagLine}`,team:p.team,rawChampionName:p.gameName==='Gwiezdna'
          ? `Character_${enemyReadFailure?'Unknown':champions.find(c=>c.id===p.championId).alias}_Name`
          : `game_character_displayname_${champions.find(c=>c.id===p.championId).alias}`,
        items:(p.gameName==='Daniel'?ownItems:p.gameName==='Gwiezdna'?enemyItems:[]).map((itemID,slot)=>({itemID,slot,count:1}))}))}:null;
    if(pending){const hold=pending;pending=null;await hold.promise;}
    return snapshot;
  }},...args);
};
app.on('browser-window-created',(_e,w)=>{win=w;win.webContents.setBackgroundThrottling(false);win.setPosition(-30000,-30000);win.show=()=>{};win.focus=()=>{};});
const waitFor=async(fn,message)=>{const until=Date.now()+15000;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error(message);};
server.once('listening',async()=>{
  process.env.LCU_MOCK=`http://127.0.0.1:${server.address().port}`;require('../src/main');
  try{
    await waitFor(()=>win&&!win.webContents.isLoading(),'Brak okna');
    const evaluate=js=>win.webContents.executeJavaScript(js),state=()=>evaluate('window.assist.getState()');
    const step=n=>fetch(`${process.env.LCU_MOCK}/__step?n=${n}`);
    await waitFor(async()=> (await state())?.final?.build?.shop?.gold===1000,'Brak odczytu złota');
    let b=(await state()).final.build;
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'champions.json'))).version,7);
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'champions.backup-v6.json'))).version,6);
    assert.equal(b.baseSource.mode,'aram');
    assert.ok(await evaluate('document.body.textContent.includes("OP.GG 16.22")'));
    assert.equal(b.shop.status,'buy');assert.equal(b.shop.target.id,3135);assert.notEqual(b.shop.purchase.id,1026);
    assert.ok(b.shop.purchase.cost<=1000);assert.equal(b.shop.enemies,'live');assert.equal(b.items[0].id,6655);assert.equal(b.items[0].owned,true);
    assert.ok(b.liveAdaptation.some(a=>a.item===3135));
    assert.ok(b.shop.comparison.length>=2);
    assert.equal(b.lastChange,null,'Pierwszy odczyt nie jest zmianą buildu');
    assert.equal(b.readout.inventory.status,'live');assert.equal(b.readout.enemies.status,'live');
    assert.equal(b.readout.screen.count,0);
    assert.ok(await evaluate('document.querySelector(".readout").textContent.includes("Headliner")'));
    enemyItems=[];
    await waitFor(async()=>!(await state()).final.build.liveAdaptation.length,'Brak wycofania reakcji na zakupy');
    enemyItems=[4401,3111];
    await waitFor(async()=>(await state()).final.build.lastChange?.evidence.length,'Brak wyjaśnienia zmiany po zakupach wroga');
    b=(await state()).final.build;
    assert.ok(b.lastChange.causes.some(c=>c.includes('odporność')));assert.ok(b.lastChange.title.includes(b.shop.target.name));
    fs.writeFileSync(path.join(out,'readout-state.json'),JSON.stringify(await state()));
    assert.ok(await evaluate('!!document.querySelector(".build-change")'));
    const changeAt=b.lastChange.at,enemiesAt=b.readout.enemies.at;
    enemyReadFailure=true;
    await waitFor(async()=>(await state()).final.build.readout.enemies.status==='stale','Brak osobnego statusu zakupów wrogów');
    b=(await state()).final.build;
    assert.equal(b.readout.inventory.status,'live');assert.equal(b.readout.enemies.at,enemiesAt);assert.equal(b.lastChange.at,changeAt);
    fs.writeFileSync(path.join(out,'enemy-gap-state.json'),JSON.stringify(await state()));
    enemyReadFailure=false;
    await waitFor(async()=>(await state()).final.build.readout.enemies.status==='live','Zakupy wrogów nie wróciły');
    assert.equal((await state()).final.build.lastChange.at,changeAt,'Przerwa nie może udawać sprzedaży i zakupu');
    // A match-only purchase goal is set through the actual selector and IPC.
    b=(await state()).final.build;
    const pinnedId=b.purchaseGoal.options.find(i=>i.id!==3135&&i.id!==3020).id;
    const oldGoal=b.purchaseGoal;
    await evaluate(`const nextSelect=document.querySelector('[data-next-choice]');nextSelect.value='${pinnedId}';nextSelect.dispatchEvent(new Event('change',{bubbles:true}));void 0`);
    await waitFor(async()=>(await state()).final.build.shop.target?.id===pinnedId,'Przypięcie nie ustawiło następnego zakupu');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'next-purchase.json'))).id,pinnedId);
    const stale=await evaluate(`window.assist.setNextPurchase(${JSON.stringify({key:oldGoal.key,revision:oldGoal.revision,id:null})})`);assert.equal(stale.ok,false);
    enemyItems=[];await waitFor(async()=>!(await state()).final.build.liveAdaptation.length,'Zakupy nie zostały odświeżone');
    assert.equal((await state()).final.build.shop.target.id,pinnedId);
    enemyItems=[4401,3111];await waitFor(async()=>(await state()).final.build.purchaseGoal.suggestion?.id===3135,'Brak alternatywy po zakupach wroga');
    assert.equal((await state()).final.build.shop.target.id,pinnedId);
    const fullBounds=win.getBounds();
    await evaluate('window.assist.setViewMode(true)');
    await waitFor(()=>evaluate('document.body.classList.contains("compact-mode")'),'Brak małego widoku');
    assert.equal(win.getBounds().width,520);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    assert.ok(await evaluate('document.querySelector(".compact-tip").getBoundingClientRect().bottom<innerHeight'),'Porada nie mieści się w małym widoku');
    assert.ok(await evaluate('!!document.querySelector(".compact-alternative")'));
    fs.writeFileSync(path.join(out,'compact-state.json'),JSON.stringify(await state()));
    const refresh=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.webContents.reload();await refresh;
    await waitFor(()=>evaluate('document.body.classList.contains("compact-mode")'),'Mały widok nie wrócił po przeładowaniu');
    assert.equal((await state()).final.build.shop.target.id,pinnedId);
    assert.equal((await state()).dataStatus.version,'16.22');
    await evaluate('showDataStatus()');
    assert.ok(await evaluate('document.querySelector("#data-status-dialog").textContent.includes("Zgodność niepotwierdzona")'));
    await evaluate('document.querySelector("#data-status-dialog").close();document.querySelector("#view-toggle").click();void 0');
    await waitFor(()=>evaluate('!document.body.classList.contains("compact-mode")'),'Brak powrotu pełnego widoku');
    assert.equal(win.getBounds().width,fullBounds.width);
    await evaluate('document.querySelector("[data-unpin-next]").click();void 0');
    await waitFor(async()=>(await state()).final.build.purchaseGoal.id===null,'Cel nie został odblokowany');
    assert.equal((await state()).final.build.shop.target.id,3135);
    await evaluate(`document.querySelector('.live-shop details').open=true;void 0`);
    await new Promise(r=>setTimeout(r,250));
    fs.writeFileSync(path.join(out,'comparison.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
    await evaluate(`document.querySelector('.live-shop details').open=false;void 0`);
    // Exercise the real editor and IPC, not just rendering a handcrafted Headliner.
    await evaluate('openMayhemEditor()');
    await evaluate(`document.querySelector('[name=headliner]').value='pentakill';document.querySelector('[name=headliner]').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[name=headliner-ability]').value='R';document.querySelector('[name=headliner-ability]').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#mayhem-form').requestSubmit();void 0`);
    await waitFor(async()=> (await state()).final.build.mayhem.headliner?.ability==='R','Headliner nie zapisany');
    const augmentCatalog=require('../data/mayhem-augments.json').augments;
    const augmentIds=['Goliath','HeavyHitter','Deft','ApexInventor','ItsCritical','JeweledGauntlet'].map(k=>augmentCatalog.find(a=>a.api.replace(/^ARAM_/,'')===k).id);
    const set=await evaluate(`(async()=>{const c=await window.assist.getMayhem();return window.assist.setMayhem({matchKey:c.matchKey,selection:{...c.selection,augments:${JSON.stringify(augmentIds)}},autoInventory:true,knownScreenAugments:c.screenAugments,screenUndoRevision:c.screenUndoRevision});})()`);
    assert.ok(set.ok);assert.equal((await state()).final.build.mayhem.hints.length,6);assert.ok((await state()).final.build.mayhem.synergies.length);
    assert.equal((await state()).final.build.readout.screen.count,6);assert.equal((await state()).final.build.readout.headliner.source,'manual');
    // Restore the starting build for existing recipe assertions.
    await evaluate(`(async()=>{const c=await window.assist.getMayhem();return window.assist.setMayhem({matchKey:c.matchKey,selection:{...c.selection,augments:[]},autoInventory:true,knownScreenAugments:c.screenAugments,screenUndoRevision:c.screenUndoRevision});})()`);
    for(const [width,height] of [[1100,760],[820,640]]){
      win.setSize(width,height);await new Promise(r=>setTimeout(r,250));
      await evaluate('window.scrollTo(0,0);document.getElementById("toast").hidden=true;void 0');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Overflow poziomy');
      assert.ok(await evaluate('document.querySelector(".live-shop").getBoundingClientRect().bottom<innerHeight'),'Kup teraz poza ekranem');
      assert.ok(await evaluate('document.querySelector(".inventory-items").getBoundingClientRect().bottom<innerHeight'),'Build poza ekranem');
      fs.writeFileSync(path.join(out,`shop-${width}.png`),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
    }
    gold=2200;
    const beforeGoldChange=(await state()).final.build.lastChange.at;
    await waitFor(async()=> (await state()).final.build.shop.gold===2200,'Złoto nie odświeżyło podpowiedzi');
    b=(await state()).final.build;assert.equal(b.shop.purchase.id,3135);assert.equal(b.shop.purchase.cost,2150);
    assert.equal(b.lastChange.at,beforeGoldChange,'Samo złoto nie zmienia planu');
    const buyGoal=b.purchaseGoal;
    assert.equal((await evaluate(`window.assist.setNextPurchase(${JSON.stringify({key:buyGoal.key,revision:buyGoal.revision,id:3135})})`)).ok,true);
    gold=50;ownItems=[6655,3020,3135];
    await waitFor(async()=> (await state()).final.build.items.some(i=>i.id===3135&&i.owned),'Zakup nie zachowany');
    b=(await state()).final.build;assert.equal(b.shop.gold,50);assert.notEqual(b.shop.purchase?.id,3135);
    assert.equal(b.purchaseGoal.id,null);assert.match(b.purchaseGoal.notice,/już w ekwipunku/);
    connected=false;
    await waitFor(async()=> (await state()).final.build.shop.status==='stale','Brak oznaczenia starego złota');
    b=(await state()).final.build;assert.equal(b.shop.gold,null);assert.equal(b.shop.purchase,undefined);assert.deepEqual(b.liveAdaptation,[]);
    fs.writeFileSync(path.join(out,'readout-stale-state.json'),JSON.stringify(await state()));
    assert.equal(b.readout.inventory.status,'stale');assert.equal(b.readout.enemies.status,'stale');
    assert.ok(await evaluate('document.querySelector("[data-readout=inventory]").textContent.includes("Przerwa")'));
    assert.ok(b.items.some(i=>i.id===3135&&i.owned));
    connected=true;gold=1200;enemyItems=[];
    await waitFor(async()=> (await state()).final.build.shop.gold===1200,'Brak ponownego połączenia');
    assert.deepEqual((await state()).final.build.liveAdaptation,[]);
    flowFailure=true;
    await waitFor(async()=> (await state()).final.build.shop.status==='stale','Niezweryfikowana sesja zostawiła stare złoto');
    assert.equal((await state()).final.build.shop.gold,null);
    flowFailure=false;
    await waitFor(async()=> (await state()).final.build.shop.gold===1200,'Nie wróciła weryfikacja sesji');
    // Odpowiedź ze starego meczu kończąca się podczas zmiany gameId jest odrzucana.
    let release;pending={promise:new Promise(r=>{release=r;})};const count=requests;
    await waitFor(()=>requests>count,'Brak oczekującego odczytu');gameId++;connected=false;release();
    await waitFor(async()=> (await state()).final.build.mayhem?.matchKey?.startsWith(gameId+':'),'Nowy mecz nie odizolował odczytu');
    b=(await state()).final.build;assert.equal(b.shop.gold,null);assert.equal(b.items.some(i=>i.owned),false);
    assert.equal(b.lastChange,null);assert.equal(b.readout.inventory.at,null);assert.equal(b.readout.enemies.at,null);
    // Te same zakupy działają w zwykłym ARAM i na SR bez nakładki Mayhem.
    for(const nextMode of ['ARAM','CLASSIC']){
      await step(-1);await waitFor(async()=> (await state())?.status==='idle','Brak lobby');
      mode=nextMode;gameId++;connected=true;gold=2200;ownItems=[6655,3020,1026];enemyItems=[4401,3111];await step(8);
      await waitFor(async()=> (await state())?.final?.build?.shop?.gold===2200,'Brak zakupów w '+nextMode);
      b=(await state()).final.build;assert.equal(b.mayhem,null);assert.equal(b.shop.target.id,3135);assert.equal(b.shop.purchase.cost,2150);
    }
    phaseOverride='EndOfGame';
    await waitFor(async()=> (await state())?.recentMatch?.reason==='ended','Brak automatycznego podsumowania');
    assert.ok(await evaluate('!!document.querySelector(".recent-match")'));
    const reloaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
    win.webContents.reload();await reloaded;
    await waitFor(()=>evaluate('!!document.querySelector(".recent-match")'),'Historia nie wróciła po przeładowaniu widoku');
    await evaluate('openMatchReviews()');
    assert.ok(await evaluate('document.getElementById("review-dialog").open'));
    assert.ok(await evaluate('document.querySelectorAll(".review-timeline li").length>1'));
    assert.equal((await state()).recentMatch.outcome,undefined,'Brak wyniku nie może być porażką');
    endReady=true;
    await waitFor(async()=> (await state()).recentMatch?.outcome?.result==='win','Automatyczny wynik nie dotarł');
    await waitFor(()=>evaluate('document.querySelector("#review-outcome").textContent.includes("automatycznie")'),'Otwarty panel nie pokazał automatycznego wyniku');
    await evaluate(`document.querySelector('#review-feedback [name=result]').value='win';document.querySelector('#review-feedback [name=rating]').value='helpful';document.querySelector('#review-feedback').requestSubmit();void 0`);
    await waitFor(async()=> (await evaluate('window.assist.matchReviews()')).matches[0].feedback?.rating==='helpful','Ocena nie zapisana');
    const disk=JSON.parse(fs.readFileSync(path.join(profile,'match-review.json'),'utf8'));
    assert.equal(disk.matches[0].feedback.result,'win');assert.equal(disk.active,null);
    assert.equal(disk.matches[0].outcome.result,'win');assert.equal(disk.matches[0].outcome.source,'client');
    assert.ok(disk.matches.find(m=>m.mode==='mayhem')?.events.some(e=>e.type==='augments'&&e.augments.length===6));
    assert.equal(JSON.stringify(disk).includes('Daniel#EUNE'),false);
    await evaluate(`document.querySelector('.review-timeline').open=true;void 0`);
    await new Promise(r=>setTimeout(r,300));
    fs.writeFileSync(path.join(out,'review-820.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
    await evaluate(`document.getElementById('review-dialog').close();document.getElementById('riot-info').click();void 0`);
    assert.ok(await evaluate(`document.getElementById('riot-dialog').open && document.getElementById('riot-dialog').textContent.includes("isn't endorsed by Riot Games")`));
    console.log('PASS: API → zakupy i przypięty cel → zmiana sytuacji → kompaktowy widok i pełny rozmiar → dane patcha → odblokowanie po zakupie; Mayhem/ARAM/SR; Headliner, augmenty, wynik i historia; widoki 520, 820 i 1100.');
    server.close();win.destroy();app.quit();
  }catch(error){console.error(error);server.close();app.exit(1);}
});
