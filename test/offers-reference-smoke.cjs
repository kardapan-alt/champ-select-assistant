// Optional local game screenshots. The images are never stored in the repository.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {WindowsOcr}=require('../src/windows-ocr');
const {readGrid,readOfferOcr,detectOffer,OfferTracker,OfferDisplay}=require('../src/augment-offers');
const {testOfferScreenshot}=require('../src/augment-screenshot');
const {rerollSlot}=require('../src/offer-history');
const catalog=require('../data/mayhem-augments.json').augments;

function load(file,expected){
  const mime=/\.png$/i.test(file)?'png':'jpeg';
  return {url:'data:image/'+mime+';base64,'+fs.readFileSync(file).toString('base64'),expected};
}

function replay(before,after,width,height,pickedSlot){
  const display=new OfferDisplay(),tracker=new OfferTracker(),aspect=width/height;
  const observe=(snapshot,at)=>{
    const {grid,detected}=snapshot;
    const id=tracker.observe({...detected,grid,aspect,at,active:true});
    if(!display.waitingForReroll(detected.cards,at))display.observe(detected.cards,at,aspect,grid);
    return id;
  };
  observe(before,1000);observe(before,1700);
  assert.ok(display.current.stable);
  // These screenshots contain the offers before and after multiple rerolls.
  // The intermediate animation and mouse input are simulated.
  for(const [slot,card] of before.detected.cards.entries()){
    if(card.id===after.detected.cards[slot].id)continue;
    display.invalidateReroll(slot,1800+slot*40);
    tracker.reset();
  }
  observe(after,2400);observe(after,3100);
  assert.deepEqual(display.cards.map(c=>c.id),after.detected.cards.map(c=>c.id));
  const chosen=after.detected.cards[pickedSlot],r=chosen.rect;
  const target={x:width*(r.x+r.w/2),y:height*(r.y+r.h/2),width,height};
  tracker.input({...target,type:'down',at:3250});tracker.input({...target,type:'up',at:3300});
  const {width:w,height:h}=after.grid;
  const pixels=Buffer.from(Array.from({length:w*h},(_,n)=>Math.round(30+90*(n%w)/w)));
  const map=readGrid({width:w,height:h,pixels:pixels.toString('base64')});
  assert.ok(map.valid);
  assert.equal(tracker.observe({grid:map,aspect,active:true,at:3550}),null);
  assert.equal(tracker.observe({grid:map,aspect,active:true,at:3950}),chosen.id);
}

app.setPath('userData',fs.mkdtempSync(path.join(require('node:os').tmpdir(),'csa-reference-')));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const w=new BrowserWindow({show:false}),ocr=new WindowsOcr();
  try{
    const shots=[load(process.env.OFFER_REFERENCE,JSON.parse(process.env.OFFER_EXPECTED_IDS||'[2100,2126,2096]'))];
    if(process.env.OFFER_REROLLED_REFERENCE)shots.push(load(process.env.OFFER_REROLLED_REFERENCE,JSON.parse(process.env.OFFER_REROLLED_IDS)));
    const buttons=JSON.parse(process.env.OFFER_REROLL_CENTERS||'[]');
    const source=fs.readFileSync(path.join(__dirname,'../src/renderer/augment-screen.js'),'utf8');
    await w.loadURL('about:blank');
    await w.webContents.executeJavaScript(fs.readFileSync(require.resolve('../src/augment-vision'),'utf8'));
    await w.webContents.executeJavaScript(source.slice(source.indexOf('function augmentOfferFrame('),source.indexOf('setInterval(pollAugmentScreen')));
    const sizes=[[2560,1440],[1920,1080],[1280,720],[2560,1080]];
    if(process.env.OFFER_FULL_FRAME==='1')sizes.unshift(null);
    for(const size of sizes){
      const snapshots=[];
      for(const shot of shots){
        const frame=await w.webContents.executeJavaScript(`(async()=>{
          const img=new Image();img.src=${JSON.stringify(shot.url)};await img.decode();
          const size=${JSON.stringify(size)},c=document.createElement('canvas');
          c.width=size?.[0]||img.width;c.height=size?.[1]||img.height;
          const x=c.getContext('2d');x.fillStyle='#203040';x.fillRect(0,0,c.width,c.height);
          const scale=!size?1:${process.env.OFFER_FULL_FRAME==='1'?'Math.min(c.width/img.width,c.height/img.height)':'Math.min(c.width/1920,c.height/1080)'};
          const w=img.width*scale,h=img.height*scale;x.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h);
          return {...augmentOfferFrame(c),width:c.width,height:c.height,imageRect:{x:(c.width-w)/2,y:(c.height-h)/2,w,h}};
        })()`);
        const grid=readGrid(frame.grid);
        const result=await readOfferOcr(ocr,frame,grid);
        const detected=detectOffer({...result,crop:frame.crop},grid,catalog,'KIWI');
        const ids=detected.cards?.map(c=>c.id);
        console.log(JSON.stringify({width:frame.width,height:frame.height,ids,band:!!result.offerLayouts}));
        assert.deepEqual(ids,shot.expected);
        if(!size){
          const offline=await testOfferScreenshot({...frame,pool:'auto'},ocr,catalog);
          assert.equal(offline.status,'offer');
          assert.deepEqual(offline.slots.map(s=>s.id),shot.expected);
        }
        buttons.forEach(([x,y],slot)=>{
          const rect=frame.imageRect;
          const atButton={width:frame.width,height:frame.height,x:rect.x+x*rect.w,y:rect.y+y*rect.h};
          assert.equal(rerollSlot(detected.cards.map(c=>c.rect),atButton,frame.width/frame.height),slot);
        });
        snapshots.push({detected,grid});
      }
      if(size&&snapshots.length===2)replay(snapshots[0],snapshots[1],...size,Number(process.env.OFFER_PICK_SLOT??1));
    }
    console.log('PASS: rzeczywiste zrzuty, odczyt lokalny i współrzędne kart we wszystkich rozmiarach.');
    if(shots.length===2)console.log('PASS: zapis symulowanego wyboru po przerzutach na kartach z obu zrzutów.');
    ocr.stop();w.destroy();app.quit();
  }catch(e){console.error(e);ocr.stop();app.exit(1);}
});
