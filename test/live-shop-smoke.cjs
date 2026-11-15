// Pełny main + prawdziwy LiveClient/parser + renderer; lokalne dane symulowane.
const {app}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../../shop-preview'),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);app.disableHardwareAcceleration();
for(const [file,value] of Object.entries({'settings.json':{stats:false,autoRunes:false,autoItemSet:false,autoPopup:false,launchAtLogin:false,keyboardShortcut:''},'choices.json':{},'mayhem-session.json':null,'augment-screen.json':null,'match-review.json':{matches:[],active:null}}))fs.writeFileSync(path.join(profile,file),JSON.stringify(value));
process.argv.push('--background');process.env.PORT='0';process.env.STEP='8';
const server=require('../mock/mock-lcu');
const {LcuClient}=require('../src/lcu'),{LiveClient}=require('../src/liveclient');
const catalog=require('../data/catalog.json');
let win,mode='KIWI',gameId=870,gold=1000,ownItems=[6655,3020,1026],enemyItems=[4401,3111],connected=true,pending=null,requests=0;
let flow,champions=[],flowFailure=false,phaseOverride=null;
const originalGet=LcuClient.prototype.get,readInventory=LiveClient.prototype.inventory;
LcuClient.prototype.get=async function(url){
  if(phaseOverride&&url==='/lol-gameflow/v1/gameflow-phase')return phaseOverride;
  if(flowFailure && url==='/lol-gameflow/v1/session')return null;
  if(url.endsWith('/items.json'))return catalog.items;
  const value=await originalGet.call(this,url);
  if(url.endsWith('/champion-summary.json'))champions=value;
  if(url==='/lol-gameflow/v1/session'&&value){value.gameData.queue.gameMode=mode;value.map.id=mode==='CLASSIC'?11:12;value.gameData.queue.id=mode==='CLASSIC'?420:450;value.gameData.gameId=gameId;flow=value;}
  return value;
};
LiveClient.prototype.inventory=async function(...args){
  return readInventory.call({read:async endpoint=>{
    assert.equal(endpoint,'/liveclientdata/allgamedata');requests++;
    const snapshot=connected?{activePlayer:{riotId:'Daniel#EUNE',currentGold:gold},gameData:{gameMode:mode,gameTime:300},
      allPlayers:[...flow.gameData.teamOne.map(p=>({...p,team:'ORDER'})),...flow.gameData.teamTwo.map(p=>({...p,team:'CHAOS'}))].map(p=>({
        riotId:`${p.gameName}#${p.tagLine}`,team:p.team,rawChampionName:`game_character_displayname_${champions.find(c=>c.id===p.championId).alias}`,
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
    assert.equal(b.shop.status,'buy');assert.equal(b.shop.target.id,3135);assert.notEqual(b.shop.purchase.id,1026);
    assert.ok(b.shop.purchase.cost<=1000);assert.equal(b.shop.enemies,'live');assert.equal(b.items[0].id,6655);assert.equal(b.items[0].owned,true);
    assert.ok(b.liveAdaptation.some(a=>a.item===3135));
    assert.ok(b.shop.comparison.length>=2);
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
    await waitFor(async()=> (await state()).final.build.shop.gold===2200,'Złoto nie odświeżyło podpowiedzi');
    b=(await state()).final.build;assert.equal(b.shop.purchase.id,3135);assert.equal(b.shop.purchase.cost,2150);
    gold=50;ownItems=[6655,3020,3135];
    await waitFor(async()=> (await state()).final.build.items.some(i=>i.id===3135&&i.owned),'Zakup nie zachowany');
    b=(await state()).final.build;assert.equal(b.shop.gold,50);assert.notEqual(b.shop.purchase?.id,3135);
    connected=false;
    await waitFor(async()=> (await state()).final.build.shop.status==='stale','Brak oznaczenia starego złota');
    b=(await state()).final.build;assert.equal(b.shop.gold,null);assert.equal(b.shop.purchase,undefined);assert.deepEqual(b.liveAdaptation,[]);
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
    await evaluate(`document.querySelector('#review-feedback [name=result]').value='win';document.querySelector('#review-feedback [name=rating]').value='helpful';document.querySelector('#review-feedback').requestSubmit();void 0`);
    await waitFor(async()=> (await evaluate('window.assist.matchReviews()')).matches[0].feedback?.rating==='helpful','Ocena nie zapisana');
    const disk=JSON.parse(fs.readFileSync(path.join(profile,'match-review.json'),'utf8'));
    assert.equal(disk.matches[0].feedback.result,'win');assert.equal(disk.active,null);
    assert.ok(disk.matches.find(m=>m.mode==='mayhem')?.events.some(e=>e.type==='augments'&&e.augments.length===6));
    assert.equal(JSON.stringify(disk).includes('Daniel#EUNE'),false);
    await evaluate(`document.querySelector('.review-timeline').open=true;void 0`);
    await new Promise(r=>setTimeout(r,300));
    fs.writeFileSync(path.join(out,'review-820.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
    await evaluate(`document.getElementById('review-dialog').close();document.getElementById('riot-info').click();void 0`);
    assert.ok(await evaluate(`document.getElementById('riot-dialog').open && document.getElementById('riot-dialog').textContent.includes("isn't endorsed by Riot Games")`));
    console.log('PASS: API → porównanie zakupów, komponenty i złoto; Mayhem/ARAM/SR; Headliner w edytorze; sześć augmentów i synergie; koniec meczu → historia → ocena na dysku; informacja Riot; widok 1100 i 820.');
    server.close();win.destroy();app.quit();
  }catch(error){console.error(error);server.close();app.exit(1);}
});
