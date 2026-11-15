const {app,desktopCapturer}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const profile=path.resolve(__dirname,'../../offers-preview/profile');fs.mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);app.disableHardwareAcceleration();
for(const [name,value] of Object.entries({'settings.json':{stats:false,autoRunes:false,autoItemSet:false,autoPopup:false,launchAtLogin:false,keyboardShortcut:''},'mayhem-session.json':null,'augment-screen.json':null}))
  fs.writeFileSync(path.join(profile,name),JSON.stringify(value));
process.argv.push('--background');process.env.PORT='0';process.env.STEP='8';
const server=require('../mock/mock-lcu');
const {LcuClient}=require('../src/lcu'),originalGet=LcuClient.prototype.get;
let gameId=777;
LcuClient.prototype.get=async function(url){if(url.endsWith('/items.json'))return require('../data/catalog.json').items;const result=await originalGet.call(this,url);
  if(url==='/lol-gameflow/v1/session'&&result){result.gameData.queue.gameMode='KIWI';result.gameData.gameId=gameId;}return result;};
require('../src/liveclient').LiveClient.prototype.inventory=async()=>({status:'waiting'});
require('../src/augment-screen').gameWindowHandle=async()=>'1234';
const {AugmentClicks}=require('../src/augment-clicks');let onInput=null,watcher=null;
const {WindowsOcr}=require('../src/windows-ocr'),originalRead=WindowsOcr.prototype.read;let beforeOcrResult=null;
WindowsOcr.prototype.read=async function(png){const result=await originalRead.call(this,png);const callback=beforeOcrResult;beforeOcrResult=null;if(callback)await callback();return result;};
AugmentClicks.prototype.start=function(handle,callback){assert.equal(handle,'1234');onInput=callback;watcher=this;this.focused=true;this.child={kill(){}};};
AugmentClicks.prototype.active=function(){return this.focused;};
desktopCapturer.getSources=async options=>{assert.deepEqual(options.types,['window']);assert.equal(options.thumbnailSize.width,0);return [{id:'window:1234:0',name:'Fixture'}];};
let win;
app.on('browser-window-created',(_e,w)=>{win=w;win.setPosition(-30000,-30000);win.show=()=>{};win.focus=()=>{};});
const waitFor=async(fn,message)=>{const end=Date.now()+25000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error(message);};
server.once('listening',async()=>{
  process.env.LCU_MOCK=`http://127.0.0.1:${server.address().port}`;require('../src/main');
  try{
    await waitFor(()=>win&&!win.webContents.isLoading(),'renderer');const evaluate=js=>win.webContents.executeJavaScript(js);
    await evaluate(`navigator.mediaDevices.getUserMedia=async constraints=>{
      if(constraints.audio!==false||constraints.video.mandatory.chromeMediaSourceId!=='window:1234:0')throw Error('wrong capture');
      const c=document.createElement('canvas');c.width=1920;c.height=1080;window.offerFixture=c;
      window.drawOffer=(titles=['Apex Inventor','Back To Basics','Ice Cold'])=>{
        const x=c.getContext('2d'),g=x.createLinearGradient(0,0,1920,1080);g.addColorStop(0,'#203040');g.addColorStop(1,'#809070');x.fillStyle=g;x.fillRect(0,0,1920,1080);
        if(!titles)return;
        for(let i=0;i<3;i++){const cx=585+i*375;x.fillStyle='#d6b5d7';x.fillRect(cx-162,210,324,594);x.fillStyle='#101923';x.fillRect(cx-156,216,312,582);
          x.strokeStyle='#ce85eb';x.lineWidth=5;x.beginPath();x.arc(cx,310,45,0,Math.PI*2);x.stroke();
          x.fillStyle='#ecdbb6';x.font='bold 28px Segoe UI';x.textAlign='center';x.fillText(titles[i],cx,448);
          x.fillStyle='#c9ccd0';x.font='18px Segoe UI';x.fillText('Improve your abilities',cx,525);x.fillText('and change your build.',cx,555);
          x.fillStyle='#74736b';x.fillRect(cx-45,845,90,35);
        }
      };drawOffer();return c.captureStream(5);
    };void 0`);
    await waitFor(()=>evaluate('lastState?.final?.build?.mayhem?.screen.status==="offers"'),'Nie odczytano kart');
    assert.ok(await evaluate('lastState.final.build.mayhem.screen.config.mode==="auto"'));
    assert.ok(await evaluate('!document.querySelector("#augment-calibration[open]")'));
    assert.equal(await evaluate('lastState.final.build.mayhem.selection.augments.length'),0);
    await waitFor(()=>evaluate('lastState.final.build.mayhem.comparison?.cards.length===3'),'Brak porównania kart');
    assert.equal(await evaluate('document.querySelectorAll("[data-offer-id]").length'),3);
    for(const [width,height] of [[1100,720],[820,640]]){
      win.setSize(width,height);await new Promise(r=>setTimeout(r,150));
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      fs.writeFileSync(path.resolve(profile,`../comparison-${width}.png`),(await win.webContents.capturePage()).toPNG());
      console.log('Comparison layout:',await evaluate('JSON.stringify({width:innerWidth,itemTop:document.querySelector(".build-primary .item")?.getBoundingClientRect().top})'));
    }
    // Otworzenie asystenta zachowuje jawnie zatrzymany podgląd kart.
    watcher.focused=false;onInput({type:'focus',focused:false,at:Date.now()});
    await waitFor(()=>evaluate('lastState.final.build.mayhem.comparison?.paused'),'Alt-Tab zgubił porównanie');
    watcher.focused=true;onInput({type:'focus',focused:true,at:Date.now()});await new Promise(r=>setTimeout(r,2000));
    // Przerzut nie jest wyborem; starszy OCR kończący się po kliknięciu nie przywraca oferty.
    let rerolled=false;
    beforeOcrResult=async()=>{
      await evaluate('window.offerHistory=[];window.trackOffers=true;window.assist.onState(s=>{if(window.trackOffers&&s.final?.build?.mayhem?.comparison)window.offerHistory.push(s.final.build.mayhem.comparison.cards[0].id)});void 0');
      for(const type of ['down','up'])onInput({type,at:Date.now(),x:585,y:860,width:1920,height:1080});
      assert.equal(await evaluate('document.querySelectorAll("[data-offer-id]").length'),0,'Stara oferta po przerzucie');
      await evaluate('drawOffer(["Eureka","Back To Basics","Ice Cold"])');rerolled=true;
    };
    await waitFor(()=>rerolled,'Przerzut podczas OCR');
    await new Promise(r=>setTimeout(r,2100));
    assert.ok(await evaluate('!offerHistory.includes(1002)'),'Spóźniony OCR przywrócił stare karty');
    await evaluate('window.trackOffers=false');
    assert.equal(await evaluate('lastState.final.build.mayhem.selection.augments.length'),0);
    await evaluate('drawOffer()');await new Promise(r=>setTimeout(r,2500));
    for(const type of ['down','up'])onInput({type,at:Date.now(),x:585,y:500,width:1920,height:1080});
    await evaluate('drawOffer(null)');
    await waitFor(()=>evaluate('lastState.final.build.mayhem.selection.augments.includes(1002)'),'Wybór nie dopisany');
    assert.ok(await evaluate('lastState.final.build.items.some(i=>i.source==="augment")'));
    assert.equal(await evaluate('document.querySelectorAll("[data-offer-id]").length'),0);
    assert.ok(await evaluate('!!document.querySelector("[data-augment-undo]")'));
    await evaluate('(async()=>{window.beforeUndo=await window.assist.getMayhem();window.oldUndo=lastState.final.build.mayhem.undo;})()');
    await evaluate('document.querySelector("[data-augment-undo]").click()');
    await waitFor(()=>evaluate('!lastState.final.build.mayhem.selection.augments.includes(1002)'),'Cofnięcie nie usunęło augmentu');
    assert.ok(await evaluate('!lastState.final.build.mayhem.undo'));
    const stale=await evaluate('window.assist.setMayhem({...beforeUndo,knownScreenAugments:beforeUndo.screenAugments})');
    assert.ok(!stale.ok&&stale.error.includes('cofnięto'));
    assert.ok(!(await evaluate('window.assist.undoAugmentRecognition({matchKey:beforeUndo.matchKey,token:oldUndo.token})')).ok);
    // Ponowny pewny odczyt tego samego wyboru nie unieważnia cofnięcia.
    await evaluate('drawOffer()');await new Promise(r=>setTimeout(r,2200));
    for(const type of ['down','up'])onInput({type,at:Date.now(),x:585,y:500,width:1920,height:1080});
    await evaluate('drawOffer(null)');await new Promise(r=>setTimeout(r,2200));
    assert.equal(await evaluate('lastState.final.build.mayhem.selection.augments.length'),0);
    assert.ok(await evaluate('!lastState.final.build.mayhem.undo'));
    // Świadomy nowy zapis ręczny może przywrócić augment, bez starego przycisku cofania.
    const manual=await evaluate('(async()=>{const c=await window.assist.getMayhem();return window.assist.setMayhem({...c,selection:{...c.selection,augments:[1002]},knownScreenAugments:c.screenAugments})})()');
    assert.ok(manual.ok);assert.ok(await evaluate('!lastState.final.build.mayhem.undo'));
    await evaluate('drawOffer()');await new Promise(r=>setTimeout(r,2200));
    for(const type of ['down','up'])onInput({type,at:Date.now(),x:960,y:500,width:1920,height:1080});
    watcher.focused=false;onInput({type:'focus',focused:false,at:Date.now()});
    await evaluate('drawOffer(null)');await new Promise(r=>setTimeout(r,1800));
    assert.equal(await evaluate('lastState.final.build.mayhem.selection.augments.length'),1);
    await evaluate('document.querySelector("[data-augment-screen-toggle]").click()');
    await waitFor(()=>evaluate('!augmentStream'),'Wyłączenie nie zatrzymało strumienia');
    win.setSize(820,640);await new Promise(r=>setTimeout(r,250));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    fs.writeFileSync(path.resolve(profile,'../automatic-build.png'),(await win.webContents.capturePage()).toPNG());
    await fetch(`${process.env.LCU_MOCK}/__step?n=-1`);await waitFor(()=>evaluate('lastState.status==="idle"'),'Lobby');
    gameId=778;await fetch(`${process.env.LCU_MOCK}/__step?n=8`);
    await waitFor(()=>evaluate('lastState.final?.build?.mayhem?.matchKey.startsWith("778:")'),'Nowy mecz');
    assert.equal(await evaluate('lastState.final.build.mayhem.selection.augments.length'),0);
    assert.ok(await evaluate('!lastState.final.build.mayhem.undo&&!lastState.final.build.mayhem.comparison'));
    assert.ok(!(await evaluate('window.assist.undoAugmentRecognition({matchKey:beforeUndo.matchKey,token:oldUndo.token})')).ok);
    console.log('PASS: rzeczywisty OCR, porównanie, zmiana ofert, zatrzymany podgląd, wybór i build, cofanie, stary formularz/przycisk, ponowny odczyt, ręczne przywrócenie i izolacja nowego meczu.');
    server.close();win.destroy();app.quit();
  }catch(e){console.error(e);if(win&&!win.isDestroyed())console.error(await win.webContents.executeJavaScript('JSON.stringify(lastState?.final?.build?.mayhem?.screen)'));server.close();app.exit(1);}
});
