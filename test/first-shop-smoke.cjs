// SoloQ loading screen -> Live Client snapshots -> persisted post-game comparison.
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
const get=LcuClient.prototype.get,inventory=LiveClient.prototype.inventory;
LcuClient.prototype.get=function(url) {
  return url.endsWith('/items.json') ? Promise.resolve(catalog.items) : get.call(this,url);
};
let gameTime=90,gold=950,items=[1056],win;
LiveClient.prototype.inventory=function(...args) {
  return inventory.call({read:async()=>({
    activePlayer:{riotId:'Daniel#EUNE',currentGold:gold},
    allPlayers:[{riotId:'Daniel#EUNE',rawChampionName:'game_character_displayname_Ahri',team:'ORDER',position:'MIDDLE',
      items:items.map((itemID,slot)=>({itemID,slot}))}],
    gameData:{gameMode:'CLASSIC',gameTime},
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
    server.close();win.destroy();app.quit();
  } catch(err) {console.error(err);server.close();app.exit(1);}
});
