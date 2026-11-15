const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const {AugmentClicks}=require(process.env.OCR_APP_DIR?require('path').resolve(process.env.OCR_APP_DIR,'src/augment-clicks.js'):'../src/augment-clicks');
app.whenReady().then(async()=>{
  const w=new BrowserWindow({show:false}),watcher=new AugmentClicks();
  try{
    const handle=w.getNativeWindowHandle().readBigUInt64LE().toString();
    const event=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Brak odpowiedzi pomocnika')),8000);
      watcher.start(handle,e=>{if(e.type==='focus'){clearTimeout(timeout);resolve(e);}});
    });
    assert.equal(event.focused,false);assert.ok(!watcher.active());watcher.stop();assert.equal(watcher.child,null);
    console.log('PASS: pomocnik Windows, rzeczywisty HWND ukrytego okna, stan aktywności, zakończenie bez przejmowania fokusu.');w.destroy();app.quit();
  }catch(e){console.error(e);watcher.stop();app.exit(1);}
});
