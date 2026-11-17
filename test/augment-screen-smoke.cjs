const {app,desktopCapturer}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const profile=path.resolve(__dirname,'../../ocr-preview/profile');fs.mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);app.disableHardwareAcceleration();
for(const [name,value] of Object.entries({'settings.json':{stats:false,autoRunes:false,autoItemSet:false,autoPopup:false,launchAtLogin:false,keyboardShortcut:''},'mayhem-session.json':null,'augment-screen.json':null}))
  fs.writeFileSync(path.join(profile,name),JSON.stringify(value));
process.argv.push('--background');process.env.PORT='0';process.env.STEP='8';
const server=require('../mock/mock-lcu');
const {LcuClient}=require('../src/lcu'),originalGet=LcuClient.prototype.get;
LcuClient.prototype.get=async function(url){if(url.endsWith('/items.json'))return require('../data/catalog.json').items;const result=await originalGet.call(this,url);
  if(url==='/lol-gameflow/v1/session'&&result)Object.assign(result.gameData.queue,{id:2400,gameMode:'KIWI'});return result;};
require('../src/liveclient').LiveClient.prototype.inventory=async()=>({status:'waiting'});
require('../src/augment-screen').gameWindowHandle=async()=>'1234';
desktopCapturer.getSources=async options=>{assert.deepEqual(options.types,['window']);assert.equal(options.thumbnailSize.width,0);return [{id:'window:1234:0',name:'Fixture'}];};
let win;
app.on('browser-window-created',(_e,w)=>{win=w;win.setPosition(-30000,-30000);win.show=()=>{};win.focus=()=>{};});
const waitFor=async(fn,message)=>{const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw Error(message);};
server.once('listening',async()=>{
  process.env.LCU_MOCK=`http://127.0.0.1:${server.address().port}`;require('../src/main');
  try{
    await waitFor(()=>win&&!win.webContents.isLoading(),'renderer');const evaluate=js=>win.webContents.executeJavaScript(js);
    await waitFor(()=>evaluate('!!lastState?.final?.build?.mayhem?.matchKey'),'Mayhem');
    await evaluate(`navigator.mediaDevices.getUserMedia=async constraints=>{
      if(constraints.audio!==false||constraints.video.mandatory.chromeMediaSourceId!=='window:1234:0')throw Error('wrong capture');
      const c=document.createElement('canvas');c.width=1920;c.height=1080;const x=c.getContext('2d');x.fillStyle='#101923';x.fillRect(0,0,c.width,c.height);x.fillStyle='#ecdbb6';x.font='bold 32px Segoe UI';x.fillText('Apex Inventor',100,850);window.ocrFixture=c;return c.captureStream(2);
    };openAugmentCalibration();`);
    await waitFor(()=>evaluate('!!document.querySelector("#augment-calibration[open]")'),'Kalibracja nie otworzyła się');
    await evaluate(`(()=>{const c=document.querySelector('#augment-calibration canvas'),r=c.getBoundingClientRect();c.setPointerCapture=()=>{};
      c.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+r.width*80/1920,clientY:r.top+r.height*805/1080,pointerId:1}));
      c.dispatchEvent(new PointerEvent('pointerup',{clientX:r.left+r.width*500/1920,clientY:r.top+r.height*870/1080,pointerId:1}));
      document.querySelector('[data-vision-preview]').click();})()`);
    await waitFor(()=>evaluate('document.querySelector("[data-vision-feedback]").textContent.includes("Genialny")'),'Podgląd nie odczytał nazwy');
    await evaluate('document.querySelector("[data-vision-save]").click()');
    await waitFor(()=>evaluate('!document.getElementById("augment-calibration").open'),'Nie zapisano kalibracji');
    await waitFor(()=>evaluate('lastState.final.build.mayhem.selection.augments.includes(1002)'),'Automatyczny OCR nie dopisał augmentu');
    assert.ok(await evaluate('lastState.final.build.items.some(i=>i.source==="augment")'));
    assert.ok(await evaluate('augmentStream.active'));
    // Odczyt samego pustego obszaru zachowuje dotychczasowy wybór.
    await evaluate('const fx=ocrFixture.getContext("2d");fx.fillStyle="#101923";fx.fillRect(0,0,1920,1080)');
    await waitFor(()=>evaluate('lastState.final.build.mayhem.screen.status==="unreadable"'),'Nie odrzucono pustego obrazu');
    assert.ok(await evaluate('lastState.final.build.mayhem.selection.augments.includes(1002)'));
    await evaluate('document.querySelector("[data-augment-screen-toggle]").click()');
    await waitFor(()=>evaluate('!augmentStream'),'Wyłączenie nie zatrzymało strumienia');
    win.setSize(820,640);await new Promise(r=>setTimeout(r,200));
    fs.writeFileSync(path.resolve(profile,'../ocr-build.png'),(await win.webContents.capturePage()).toPNG());
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    console.log('PASS: kalibracja przez renderer, rzeczywisty OCR Windows, podgląd nazwy, 3 zgodne odczyty, dopasowanie buildu, pusty obraz, zatrzymanie strumienia.');
    server.close();win.destroy();app.quit();
  }catch(e){console.error(e);server.close();app.exit(1);}
});
