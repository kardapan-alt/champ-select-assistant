const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const {WindowsOcr}=require(process.env.OCR_APP_DIR?require('path').resolve(process.env.OCR_APP_DIR,'src/windows-ocr.js'):'../src/windows-ocr');
const {recognizeText}=require('../src/augment-vision');
const catalog=require('../data/mayhem-augments.json').augments;
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const w=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}}),ocr=new WindowsOcr();
  try{
    await w.loadURL('about:blank');
    for(const title of ['Apex Inventor','Genialny Wynalazca','Back To Basics','Zimny jak Lód']){
      const png=await w.webContents.executeJavaScript(`(()=>{const c=document.createElement('canvas');c.width=800;c.height=110;const x=c.getContext('2d');x.fillStyle='#101923';x.fillRect(0,0,800,110);x.fillStyle='#ecdbb6';x.font='bold 42px Segoe UI';x.fillText(${JSON.stringify(title)},25,72);return c.toDataURL('image/png').split(',')[1]})()`);
      const result=await ocr.read(png);assert.ok(result?.readings,JSON.stringify(result));
      const detected=recognizeText(result.readings,catalog,'KIWI');assert.equal(detected.status,'match',`${title}: ${JSON.stringify(result)}`);
      const a=catalog.find(a=>a.english===title||a.name===title);assert.equal(detected.id,a.id);
      console.log('PASS Windows OCR:',title);
    }
    ocr.stop();w.destroy();app.quit();
  }catch(e){console.error(e);ocr.stop();app.exit(1);}
});
