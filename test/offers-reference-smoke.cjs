// Optional external reference image; it is never included in the repository/build.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),assert=require('node:assert/strict');
const {WindowsOcr}=require('../src/windows-ocr');
const {readGrid,detectOffer}=require('../src/augment-offers');
const catalog=require('../data/mayhem-augments.json').augments;
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const w=new BrowserWindow({show:false}),ocr=new WindowsOcr();
  try{
    const url='data:image/'+(/\.png$/i.test(process.env.OFFER_REFERENCE)?'png':'jpeg')+';base64,'+fs.readFileSync(process.env.OFFER_REFERENCE).toString('base64');
    const expected=JSON.parse(process.env.OFFER_EXPECTED_IDS||'[2100,2126,2096]');
    const source=fs.readFileSync(require('path').join(__dirname,'../src/renderer/augment-screen.js'),'utf8');
    await w.loadURL('about:blank');
    await w.webContents.executeJavaScript(fs.readFileSync(require.resolve('../src/augment-vision'),'utf8'));
    await w.webContents.executeJavaScript(source.slice(source.indexOf('function augmentOfferFrame('),source.indexOf('setInterval(pollAugmentScreen')));
    for(const [width,height] of [[2560,1440],[1920,1080],[1280,720],[2560,1080]]){
      const frame=await w.webContents.executeJavaScript(`(async()=>{
        const img=new Image();img.src=${JSON.stringify(url)};await img.decode();
        const c=document.createElement('canvas');c.width=${width};c.height=${height};const x=c.getContext('2d');x.fillStyle='#203040';x.fillRect(0,0,c.width,c.height);
        const scale=${process.env.OFFER_FULL_FRAME==='1'?'Math.min(c.width/img.width,c.height/img.height)':'Math.min(c.width/1920,c.height/1080)'},w=img.width*scale,h=img.height*scale;x.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h);
        return augmentOfferFrame(c);
      })()`);
      const result=await ocr.read(frame.png),d=detectOffer({...result,crop:frame.crop},readGrid(frame.grid),catalog,'KIWI');
      console.log(JSON.stringify({width,height,candidates:d.candidates.map(c=>c.id),cards:d.cards}));
      assert.deepEqual(d.cards?.map(c=>c.id),expected);
    }
    console.log('PASS: obraz referencyjny kart, OCR i automatyczne ramki w 1440p, 1080p, 720p i ultrawide.');ocr.stop();w.destroy();app.quit();
  }catch(e){console.error(e);ocr.stop();app.exit(1);}
});
