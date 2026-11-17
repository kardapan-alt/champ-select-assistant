// Real Electron main/renderer/import with an isolated profile and mock LCU only.
const {app}=require('electron'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
process.on('uncaughtException',e=>{console.error(e);app.exit(1);});
process.on('unhandledRejection',e=>{console.error(e);app.exit(1);});
const watchdog=setTimeout(()=>{console.error('Rune smoke exceeded 90 seconds');app.exit(1);},90000);watchdog.unref();
const out=path.resolve(__dirname,'../../runes-preview'),profile=path.join(out,'profile');
fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);app.disableHardwareAcceleration();
const data=require('../data/champions.json'),catalog=require('../data/catalog.json');
const old=structuredClone(data);old.version=6;old.champions.Garen.runes='electrocute_mage';
for(const [name,value] of Object.entries({'settings.json':{stats:false,autoRunes:true,autoItemSet:false,autoPopup:false,launchAtLogin:false,keyboardShortcut:''},'choices.json':{},'champions.json':old,'next-purchase.json':null,'match-review.json':{},'mayhem-session.json':null}))fs.writeFileSync(path.join(profile,name),JSON.stringify(value));
process.argv.push('--background');process.env.PORT='0';process.env.STEP='3';
const server=require('../mock/mock-lcu'),{LcuClient}=require('../src/lcu');
// The mock assigns sequential IDs; keep its IDs rather than mixing in live IDs.
const aliases=[...Object.keys(data.champions),'Zoe','KSante','Rumble'],id=a=>aliases.indexOf(a)+1;
let win,swapped=false,mode='CLASSIC',posts=0;
const get=LcuClient.prototype.get,request=LcuClient.prototype.request;
LcuClient.prototype.request=async function(method,url,...args){if(method==='POST'&&url==='/lol-perks/v1/pages')posts++;return request.call(this,method,url,...args);};
LcuClient.prototype.get=async function(url){
  if(url.endsWith('/perkstyles.json'))return catalog.perkstyles;
  if(url.endsWith('/perks.json'))return catalog.perks;
  if(url==='/lol-patch/v1/game-version')return '16.22.1';
  const value=await get.call(this,url);
  if(value&&url==='/lol-gameflow/v1/session'){value.gameData.queue.gameMode=mode;value.map.id=mode==='CLASSIC'?11:12;}
  if(value&&url==='/lol-champ-select/v1/session'){
    const me=value.myTeam.find(p=>p.cellId===value.localPlayerCellId);me.championId=id('Garen');me.assignedPosition='top';
    const opponents=[['Teemo',swapped?'middle':'top'],['Renekton',swapped?'top':'middle'],['Jinx','bottom'],['Sejuani','jungle'],['Lulu','utility']];
    value.theirTeam=opponents.map(([alias,assignedPosition],i)=>({cellId:i+5,championId:id(alias),assignedPosition}));
    value.actions=[[...value.myTeam,...value.theirTeam].map(p=>({type:'pick',actorCellId:p.cellId,championId:p.championId,completed:true}))];
  }
  return value;
};
app.on('browser-window-created',(_e,w)=>{win=w;w.setPosition(-30000,-30000);w.show=()=>{};w.focus=()=>{};w.webContents.setBackgroundThrottling(false);});
const waitFor=async(fn,msg)=>{const until=Date.now()+15000;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error(msg);};
server.once('listening',async()=>{
  process.env.LCU_MOCK=`http://127.0.0.1:${server.address().port}`;require('../src/main');
  try{
    await waitFor(()=>win&&!win.webContents.isLoading(),'window');
    console.log('Window ready');
    const evaluate=js=>win.webContents.executeJavaScript(js),state=()=>evaluate('window.assist.getState()');
    const current=async()=>{const r=await fetch(process.env.LCU_MOCK+'/lol-perks/v1/currentpage');return r.json();};
    const step=n=>fetch(process.env.LCU_MOCK+'/__step?n='+n);
    await waitFor(async()=> (await current()).selectedPerkIds?.includes(8444),'Second Wind was not imported');
    console.log('Initial page imported');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'champions.json'))).version,7);
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'champions.backup-v6.json'))).version,6);
    let view=await state();assert.equal(view.myChampion.runes.runeSource.position,'top');
    assert.ok(view.dataStatus.rows.some(r=>r.name==='Strona run'));
    const before=posts;swapped=true;
    await waitFor(async()=> (await current()).selectedPerkIds?.includes(8473),'Role swap did not update imported runes');
    console.log('Role swap imported');
    assert.ok(posts>before);view=await state();assert.equal(view.myChampion.runes.laneOpponent,'Renekton');
    assert.deepEqual((await current()).selectedPerkIds,view.myChampion.runes.selectedPerkIds);
    assert.ok(await evaluate('document.body.textContent.includes("OP.GG 16.22")'));
    const manual=await current();manual.selectedPerkIds[6]=manual.selectedPerkIds[6]===5008?5005:5008;
    await fetch(process.env.LCU_MOCK+'/lol-perks/v1/pages/'+manual.id,{method:'DELETE'});delete manual.id;manual.name='My manual rune page';
    await fetch(process.env.LCU_MOCK+'/lol-perks/v1/pages',{method:'POST',body:JSON.stringify(manual)});
    await waitFor(async()=> (await state()).myChampion?.runes.pinned,'Manual page not preserved');
    swapped=false;await waitFor(async()=> (await state()).myChampion?.runes.laneOpponent==='Teemo','Draft did not refresh');
    assert.deepEqual((await current()).selectedPerkIds,manual.selectedPerkIds);
    for(const next of ['ARAM','KIWI']){
      await step(-1);await waitFor(async()=> (await state()).status==='idle','Lobby');mode=next;await step(3);
      await waitFor(async()=> (await state()).status==='champselect'&&(await state()).mode===(next==='ARAM'?'aram':'mayhem'),'Mode');
      if(next==='ARAM'){
        await waitFor(async()=> (await current()).selectedPerkIds?.[0]===data.champions.Garen.aram.runes.perks[0],'ARAM rune import');
        assert.equal((await state()).myChampion.runes.runeSource.mode,'aram');
      }else{
        const count=posts;assert.equal((await state()).myChampion.runes.disabled,true);
        await new Promise(r=>setTimeout(r,2200));assert.equal(posts,count,'Mayhem imported runes');
      }
    }
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({version:require('../package.json').version,posts,migration:true,roleSwap:true,manualPreserved:true,aram:true,mayhemDisabled:true},null,2));
    console.log('PASS: migration → actual rune import → same champions swap roles → manual preservation → ARAM page → Mayhem disabled.');
    server.close();win.destroy();app.quit();
  }catch(e){console.error(e);server.close();app.exit(1);}
});
