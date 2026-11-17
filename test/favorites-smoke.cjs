// Use an isolated offline profile to exercise the normal post-match and library controls.
const {app} = require('electron');
const assert = require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cs-assist-favorites-'));
app.setPath('userData',profile);
app.disableHardwareAcceleration();
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({stats:false,autoRunes:false,autoItemSet:false,autoPopup:false,launchAtLogin:false,keyboardShortcut:''}));
const match={mode:'mayhem',reason:'ended',key:'test-match',alias:'Zed',name:'Zed',firstRead:5,duration:91,endedAt:Date.now(),
  events:[],augments:[{id:3088,name:'SZKARŁATNY KOBALT'}],items:[{id:3031,name:'Infinity Edge',count:1}],headliner:{id:'pentakill',name:'Pentakill',ability:'Q'}};
fs.writeFileSync(path.join(profile,'match-review.json'),JSON.stringify({matches:[match],active:null}));
require('../src/lcu').findCredentials=async()=>null;
process.argv.push('--background');
let win;
app.on('browser-window-created',(_e,w)=>{win=w;win.setPosition(-30000,-30000);win.show=()=>{};win.focus=()=>{};});
require('../src/main');
const evaluate=js=>win.webContents.executeJavaScript(js);
const wait=async expression=>{
  const until=Date.now()+12000;
  while(Date.now()<until){if(win&&!win.webContents.isLoading()&&await evaluate(expression))return;await new Promise(r=>setTimeout(r,80));}
  throw Error('Timeout: '+expression);
};
app.whenReady().then(async()=>{
  await wait("document.getElementById('match-history') && typeof openMatchReviews==='function'");
  await evaluate("document.getElementById('match-history').click()");
  await wait("!!document.querySelector('[data-save-favorite]')");
  await evaluate("document.querySelector('[data-save-favorite]').click()");
  await wait("document.querySelector('[data-save-favorite]').dataset.savedId");
  await evaluate("document.querySelector('[data-save-favorite]').click()");
  await wait("!!document.querySelector('#favorites-dialog[open] details[open]')");
  await evaluate("const area=document.querySelector('#favorites-dialog textarea');area.value='Powtórzyć pod AP'; area.form.requestSubmit()");
  await wait("document.querySelector('.favorite [role=status]').textContent.includes('Zapisano')");
  for(const query of ['cobalt','szkarlatny','ostrze nieskonczonosci','infinity edge','zed','powtorzyc','pentakill','brak-dopasowania']){
    const matches=await evaluate(`(()=>{const s=document.querySelector('#favorites-dialog input');s.value=${JSON.stringify(query)};s.dispatchEvent(new Event('input')); return !document.querySelector('.favorite').hidden})()`);
    assert.equal(matches,query!=='brak-dopasowania',query);
  }
  await evaluate("document.querySelector('[data-close-favorites]').click();document.querySelector('[data-open-favorites]').click()");
  await wait("document.querySelector('#favorites-dialog[open] textarea')?.value==='Powtórzyć pod AP'");
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'mayhem-favorites.json'),'utf8')).length,1);
  await evaluate("document.querySelector('.favorite').open=true;document.querySelector('[data-remove-favorite]').click()");
  await wait("document.querySelector('#favorites-dialog[open] .favorite-empty')?.textContent.includes('Dodaj do ulubionych')");
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'mayhem-favorites.json'),'utf8')).length,0);
  console.log('PASS: zapis ulubionej kombinacji z meczu, lokalna notatka, wyszukiwanie PL/EN, biblioteka i usuwanie.');
  win.destroy();app.quit();
}).catch(err=>{console.error(err);app.exit(1);});
