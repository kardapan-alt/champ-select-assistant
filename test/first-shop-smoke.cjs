// Live shopping through the SoloQ post-game screen and a single-player training session.
const {app,globalShortcut}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LcuClient}=require('../src/lcu');
const {LiveClient}=require('../src/liveclient');
const catalog=require('../data/catalog.json');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'csa-first-shop-'));
app.setPath('userData',profile);
app.disableHardwareAcceleration();
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({
  stats:false,autoRunes:false,autoItemSet:false,autoPopup:false,launchAtLogin:false,keyboardShortcut:'',
}));
globalShortcut.register=()=>true;
globalShortcut.unregister=()=>{};
process.argv.push('--background');
process.env.PORT='0';process.env.STEP='6';
const server=require('../mock/mock-lcu');
let practice=false,practiceSelected=false,practiceChampion,gameTime=90,gold=950,items=[1056],win;
const get=LcuClient.prototype.get,inventory=LiveClient.prototype.inventory;
LcuClient.prototype.get=async function(url) {
  if(url.endsWith('/items.json'))return catalog.items;
  const value=await get.call(this,url);
  if(url.endsWith('/champion-summary.json'))practiceChampion=value.find(c=>c.alias==='Zaahen');
  if(practice && url==='/lol-gameflow/v1/session') {
    const me=value.gameData.teamOne.find(p=>p.puuid==='puuid-me');
    return {map:{id:11},gameData:{gameId:778,queue:{id:3140,gameMode:'PRACTICETOOL'},
      teamOne:[{...me,championId:practiceSelected?practiceChampion.id:0,selectedPosition:''}],teamTwo:[]}};
  }
  return value;
};
LiveClient.prototype.inventory=function(...args) {
  return inventory.call({read:async()=>({
    activePlayer:{riotId:'Daniel#EUNE',currentGold:gold},
    allPlayers:[{riotId:'Daniel#EUNE',rawChampionName:practice?'Character_Zaahen_Name':'game_character_displayname_Ahri',team:'ORDER',position:practice?'':'MIDDLE',
      items:items.map((itemID,slot)=>({itemID,slot}))}],
    gameData:{gameMode:practice?'PRACTICETOOL':'CLASSIC',mapNumber:11,gameTime},
  })},...args);
};
app.on('browser-window-created',(_event,created)=>{
  win=created;win.setPosition(-30000,-30000);win.show=()=>{};win.focus=()=>{};
  win.webContents.setBackgroundThrottling(false);
});
const evaluate=js=>win.webContents.executeJavaScript(js);
async function waitFor(js) {
  const end=Date.now()+18000;
  while(Date.now()<end) {
    if(win && !win.webContents.isLoading() && await evaluate(js))return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Timed out: '+js);
}
async function sample(time,wallet,ids) {
  gameTime=time;gold=wallet;items=ids;
  await waitFor("typeof lastState!=='undefined' && lastState?.final?.build?.shop?.gold==="+wallet);
}
server.once('listening',async()=>{
  process.env.LCU_MOCK='http://127.0.0.1:'+server.address().port;
  require('../src/main');
  try {
    await sample(90,950,[1056]);
    await sample(92,650,[1056,1001]);
    await sample(94,250,[1056,1001,1052]);
    for(const time of [100,106,112])await sample(time,time+200,[1056,1001,1052]);
    await fetch(process.env.LCU_MOCK+'/__step?n=-1');
    await waitFor("lastState?.status==='idle'");
    await evaluate("document.querySelector('#match-history').click()");
    await waitFor("document.querySelector('[data-first-shop]')?.innerText.includes('Twój zakup')");
    const panel=await evaluate("document.querySelector('[data-first-shop]').innerText");
    assert.match(panel,/1:32 – 1:34/);assert.match(panel,/950 zł/);assert.match(panel,/700 zł/);
    assert.match(panel,/Boots, Amplifying Tome/);assert.match(panel,/Zostałoby \d+ zł/);
    assert.doesNotMatch(panel,/w trakcie tej serii|Wcześniejszy zakup/);
    console.log('PASS: SoloQ first shopping trip appears in post-game history with budget, actual basket, and affordable alternative.');

    await evaluate("document.getElementById('review-dialog').close()");
    practice=true;
    await fetch(process.env.LCU_MOCK+'/__step?n=6');
    await waitFor("lastState?.mode==='practice' && document.getElementById('app').innerText.includes('Czekam na Twoją postać')");
    assert.equal(await evaluate("!!document.querySelector('.live-shop')"),false);
    practiceSelected=true;
    await sample(89,549,[]);
    const session=await evaluate('window.assist.getState()');
    assert.equal(session.mode,'practice');
    assert.equal(session.status,'loading-screen');
    const build=session.final.build;
    assert.equal(build.mode,'practice');
    assert.equal(build.alias,'Zaahen');
    assert.equal(build.baseSource.mode,'classic');
    assert.equal(build.mayhem,null);
    assert.ok(build.items.length>1);
    const {purchase:component,target}=build.shop;
    assert.equal(component.component,true);
    assert.ok(component.cost<=549);
    const fullShop=await evaluate("document.querySelector('.live-shop').innerText");
    assert.match(await evaluate("document.getElementById('status').innerText"),/Practice Tool/i);
    assert.ok(await evaluate("document.querySelector('.build-panel .items.path').innerText.includes("+JSON.stringify(target.name)+")"));
    assert.match(await evaluate("document.querySelector('[data-readout=enemies]').innerText"),/bez przeciwników/i);
    assert.match(fullShop,/Kup teraz/);
    assert.match(fullShop,/549/);
    assert.ok(fullShop.includes(component.name));
    assert.doesNotMatch(fullShop,/zakupy wrogów jeszcze niepotwierdzone/i);

    await evaluate("document.getElementById('view-toggle').click()");
    await waitFor("document.querySelector('.compact-content .live-shop')?.innerText.includes('549')");
    const compactText=await evaluate("document.querySelector('.compact-content').innerText");
    assert.match(compactText,/Practice Tool|trening/i);
    assert.ok(compactText.includes(component.name));
    assert.ok(await evaluate("document.querySelector('.compact-build').innerText.includes("+JSON.stringify(target.name)+")"));
    await sample(91,549-component.cost,[component.id]);
    let shop=await evaluate('lastState.final.build.shop');
    assert.equal(shop.target.id,target.id);
    assert.equal(shop.target.credit,component.cost);
    assert.equal(shop.target.cost,target.cost-component.cost);
    await sample(93,shop.target.cost,[component.id]);
    shop=await evaluate('lastState.final.build.shop');
    assert.equal(shop.purchase.id,target.id);
    assert.equal(shop.remaining,0);
    await sample(95,0,[target.id]);
    const completed=await evaluate('lastState.final.build');
    assert.ok(completed.items.some(i=>i.id===target.id && i.owned));
    assert.notEqual(completed.shop.target.id,target.id);
    await sample(97,550,[]);
    const reset=await evaluate('lastState.final.build');
    assert.equal(reset.shop.target.id,target.id);
    assert.equal(reset.shop.target.credit,0);
    assert.ok(reset.items.every(i=>!i.owned));
    console.log('PASS: Practice Tool shows a solo Zaahen build and live gold in both views; buying a component, completing the item, and clearing inventory recalculate the plan.');
    server.close();win.destroy();app.quit();
  } catch(err) {console.error(err);server.close();app.exit(1);}
});
