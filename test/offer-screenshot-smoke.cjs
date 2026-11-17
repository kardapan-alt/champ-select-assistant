// Optional real game screenshot supplied locally through OFFER_REFERENCE + OFFER_EXPECTED_IDS.
const {app}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const catalog=require('../data/mayhem-augments.json').augments;
const {WindowsOcr}=require('../src/windows-ocr');
const read=WindowsOcr.prototype.read;
let missingSlot=null;
// Simulate a missed title while retaining the real OCR response for the
// other columns, the live detector's frame geometry and the original image.
WindowsOcr.prototype.read=async function(png) {
  const result=await read.call(this,png);
  if(missingSlot===null || !result?.layouts) return result;
  const center=[.308,.5,.692][missingSlot];
  return {...result,layouts:result.layouts.map(layout=>layout.map(line=>({...line,words:line.words.filter(word=>{
    const x=(word.x+word.w/2)/result.width, y=(word.y+word.h/2)/result.height;
    return Math.abs(x-center)>.095 || y<.33 || y>.49;
  })})))};
};
const profile=path.resolve(__dirname,'../../screenshot-test-preview/profile');
fs.mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);app.disableHardwareAcceleration();
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({stats:false,autoRunes:false,autoItemSet:false,autoPopup:false,launchAtLogin:false,keyboardShortcut:''}));
require('../src/lcu').findCredentials=async()=>null;
process.argv.push('--background');
let win;
app.on('browser-window-created',(_e,w)=>{win=w;win.setPosition(-30000,-30000);win.show=()=>{};win.focus=()=>{};});
require('../src/main');
const wait=async(fn,message)=>{
  const end=Date.now()+20000;
  while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}
  throw Error(message);
};
app.whenReady().then(async()=>{
  await wait(()=>win&&!win.webContents.isLoading(),'Nie wczytano renderera');
  const evaluate=source=>win.webContents.executeJavaScript(source);
  await evaluate("document.getElementById('draft-lab').click()");
  await wait(()=>evaluate("!!document.querySelector('[data-test-offer-screenshot]')"),'Brak testu w Testerze draftów');
  await evaluate("document.querySelector('[data-test-offer-screenshot]').click()");
  const snapshot=()=>['mayhem-session.json','augment-screen.json','augment-diagnostics.json'].map(name=>{
    const file=path.join(profile,name);return fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
  });
  const before=snapshot(),testNames=['Perseverance','Fan The Hammer','Vampirism'];
  const fixturePng=await evaluate(`(()=>{
    const c=document.createElement('canvas');c.width=1920;c.height=1080;
    const x=c.getContext('2d'),bg=x.createLinearGradient(0,0,c.width,c.height);
    bg.addColorStop(0,'#203040');bg.addColorStop(1,'#809070');x.fillStyle=bg;x.fillRect(0,0,c.width,c.height);
    ${JSON.stringify(testNames)}.forEach((name,i)=>{
      const cx=585+375*i;x.fillStyle='#d6b5d7';x.fillRect(cx-162,210,324,596);
      x.fillStyle='#101923';x.fillRect(cx-156,216,312,582);
      x.strokeStyle='#ce85eb';x.lineWidth=5;x.beginPath();x.arc(cx,310,45,0,Math.PI*2);x.stroke();
      x.fillStyle='#ffe8bc';x.font='bold 28px Segoe UI';x.textAlign='center';x.fillText(name,cx,448);
      x.fillStyle='#c9ccd0';x.font='18px Segoe UI';x.fillText('Improve your abilities',cx,525);x.fillText('and change your build.',cx,555);
    });window.screenshotFixture=c;return c.toDataURL().split(',')[1];
  })()`);
  let source=process.env.OFFER_REFERENCE,expected=testNames;
  if(source)expected=JSON.parse(process.env.OFFER_EXPECTED_IDS).map(id=>catalog.find(a=>a.id===id).english);
  else{source=path.join(profile,'fixture.png');fs.writeFileSync(source,Buffer.from(fixturePng,'base64'));}
  const chooseFile=async()=>{
    const dbg=win.webContents.debugger;dbg.attach();
    try {
      const {root}=await dbg.sendCommand('DOM.getDocument');
      const {nodeId}=await dbg.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:'#offer-screenshot-test input[type=file]'});
      await dbg.sendCommand('DOM.setFileInputFiles',{nodeId,files:[path.resolve(source)]});
    } finally { dbg.detach(); }
  };
  await chooseFile();
  const outcome=()=>evaluate("document.querySelector('#offer-screenshot-test [role=status]').dataset.result || ''");
  const cardNames=()=>evaluate("[...document.querySelectorAll('.screenshot-slots article')].map(a=>(a.querySelector('small')||a.querySelector('b')).textContent)");
  await wait(outcome,'Brak wyniku po wczytaniu pliku');
  assert.equal(await outcome(),'offer');
  assert.deepEqual(await cardNames(),expected);
  console.log('Plik PNG, trzy wycinki i wynik OCR:',expected.join(' / '));
  for (let i=0;i<3;i++){
    missingSlot=i;
    await chooseFile();
    await wait(async()=>await outcome()==='incomplete','Brak odczytu 2/3 dla slotu '+i);
    assert.match(await evaluate("document.querySelector('#offer-screenshot-test [role=status]').textContent"),/Rozpoznano dwie karty/);
    assert.deepEqual(await cardNames(),expected.map((name,j)=>i===j?'Brak dopasowania':name));
  }
  missingSlot=null;
  console.log('PASS: nieczytelny lewy, środkowy i prawy tytuł, pozycje pozostałych kart zachowane.');
  await evaluate(`(async()=>{
    const blob=await new Promise(resolve=>screenshotFixture.toBlob(resolve,'image/jpeg'));
    const data=new DataTransfer();data.items.add(new File([blob],'cards.jpg',{type:'image/jpeg'}));
    document.querySelector('#offer-screenshot-test').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  })()`);
  await wait(outcome,'Brak wyniku po wklejeniu JPG');
  assert.equal(await outcome(),'offer',await evaluate("document.querySelector('.screenshot-slots').innerText"));
  assert.deepEqual(await cardNames(),testNames);
  assert.equal(await evaluate("document.querySelectorAll('.screenshot-slots canvas').length"),3);
  assert.deepEqual(snapshot(),before);
  console.log('PASS: Windows OCR przez przycisk w testerze offline, plik PNG, wklejony JPG, druga pula Mayhem i zachowane dane meczu.');
  win.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
