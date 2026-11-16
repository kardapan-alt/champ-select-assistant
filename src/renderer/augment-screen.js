// Tylko okno procesu gry. Pełna klatka pozostaje w rendererze, do lokalnego
// Windows OCR trafia obraz gry lub wskazany tytuł. Bez plików i sieci.
let augmentStream=null,augmentVideo=null,augmentCaptureKey='',augmentReaderBusy=false,augmentCalibrationOpen=false;
let augmentScreenContext=null,augmentFrame=0,augmentGeneration=0,augmentStarting=null,augmentRetryAt=0;
function stopAugmentCapture(){
  augmentGeneration++;augmentStream?.getTracks().forEach(t=>t.stop());augmentStream=null;
  if(augmentVideo){augmentVideo.srcObject=null;augmentVideo.remove();augmentVideo=null;}
  augmentCaptureKey='';augmentScreenContext=null;augmentStarting=null;
  window.assist.stopAugmentCapture().catch(()=>{});
}
async function startAugmentCapture(matchKey){
  if(augmentStream?.active && augmentCaptureKey===matchKey)return augmentScreenContext;
  if(augmentStarting)return augmentStarting;
  stopAugmentCapture();const generation=augmentGeneration;
  augmentStarting=(async()=>{
    const context=await window.assist.augmentScreenSource(matchKey);
    if(!context.ok)throw Error(context.error);
    let media;
    try{media=await navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:context.sourceId,maxFrameRate:5}}});}
    catch{throw Error('Nie udało się przechwycić obrazu gry. Ustaw w LoL tryb okna bez ramek.');}
    if(generation!==augmentGeneration || lastState?.final?.build?.mayhem?.matchKey!==matchKey){media.getTracks().forEach(t=>t.stop());throw Error('Mecz się zmienił.');}
    augmentStream=media;augmentCaptureKey=matchKey;augmentScreenContext=context;
    augmentVideo=document.createElement('video');augmentVideo.muted=true;augmentVideo.srcObject=media;
    augmentVideo.className='augment-capture-video';document.body.appendChild(augmentVideo);await augmentVideo.play();return context;
  })();
  try{return await augmentStarting;}finally{if(generation===augmentGeneration)augmentStarting=null;}
}
function augmentFrameCanvas(){
  const width=augmentVideo?.videoWidth,height=augmentVideo?.videoHeight;
  if(!width||!height)throw Error('Brak obrazu gry. Użyj okna bez ramek.');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  canvas.getContext('2d').drawImage(augmentVideo,0,0);return canvas;
}
function augmentTitlePng(frame,region){
  const canvas=document.createElement('canvas');canvas.width=Math.round(region.w*frame.width)*2;canvas.height=Math.round(region.h*frame.height)*2;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(frame,region.x*frame.width,region.y*frame.height,region.w*frame.width,region.h*frame.height,0,0,canvas.width,canvas.height);
  const png=canvas.toDataURL('image/png').split(',')[1];canvas.width=0;canvas.height=0;return png;
}
async function pollAugmentScreen(){
  if(augmentReaderBusy || augmentCalibrationOpen || Date.now()<augmentRetryAt)return;
  const m=lastState?.final?.build?.mayhem;
  if(lastState?.status!=='loading-screen'||!m?.screen?.enabled){if(augmentStream)stopAugmentCapture();return;}
  augmentReaderBusy=true;
  try{
    const context=await startAugmentCapture(m.matchKey),frame=augmentFrameCanvas(),config=m.screen.config,at=Date.now();
    const automatic=config?.mode==='auto'?augmentOfferFrame(frame):null;
    const result=await window.assist.augmentScreenFrame({matchKey:m.matchKey,token:context.token,revision:m.screen.revision,frame:++augmentFrame,
      at,width:frame.width,height:frame.height,grid:automatic?.grid,
      png:automatic?.png || (AugmentVision.sameLayout(config,frame.width,frame.height)?augmentTitlePng(frame,config.regions[0]):null)});
    frame.width=0;frame.height=0;
    if(!result.ok)throw Error(result.error||'Ponawiam odczyt okna gry.');
    augmentRetryAt=0;
  }catch(err){
    augmentRetryAt=Date.now()+4000;
    stopAugmentCapture();await window.assist.augmentScreenProblem({matchKey:m.matchKey,error:err.message}).catch(()=>{});
  }finally{augmentReaderBusy=false;}
}
function augmentOfferFrame(frame){
  const c=document.createElement('canvas'),sourceWidth=Math.min(frame.width,frame.height*16/9),sourceX=(frame.width-sourceWidth)/2;
  const crop={x:sourceX/frame.width,y:0,w:sourceWidth/frame.width,h:1},ratio=Math.min(2000/sourceWidth,1500/frame.height);
  c.width=Math.round(sourceWidth*ratio);c.height=Math.round(frame.height*ratio);
  c.getContext('2d').drawImage(frame,sourceX,0,sourceWidth,frame.height,0,0,c.width,c.height);
  // Jasne litery gry na ciemnej karcie: OCR lepiej odczytuje ciemny tekst na bieli.
  const ocrContext=c.getContext('2d'),ocrPixels=ocrContext.getImageData(0,0,c.width,c.height);
  for(let i=0;i<ocrPixels.data.length;i+=4){const d=ocrPixels.data,v=255-Math.min(255,Math.max(0,(d[i]*.299+d[i+1]*.587+d[i+2]*.114-50)*1.7));d[i]=d[i+1]=d[i+2]=v;}
  ocrContext.putImageData(ocrPixels,0,0);
  const png=c.toDataURL('image/png').split(',')[1];
  const scale=Math.min(640/frame.width,640/frame.height);c.width=Math.round(frame.width*scale);c.height=Math.round(frame.height*scale);
  const ctx=c.getContext('2d');ctx.drawImage(frame,0,0,c.width,c.height);
  const data=ctx.getImageData(0,0,c.width,c.height).data,parts=[];
  for(let i=0;i<data.length;i+=4)parts.push(String.fromCharCode(Math.round(data[i]*.299+data[i+1]*.587+data[i+2]*.114)));
  const grid={width:c.width,height:c.height,pixels:btoa(parts.join(''))};c.width=0;c.height=0;return {png,grid,crop};
}
setInterval(pollAugmentScreen,700);
window.assist.onState(state=>{
  if(augmentCaptureKey && (state?.status!=='loading-screen'||state?.final?.build?.mayhem?.matchKey!==augmentCaptureKey)){
    document.getElementById('augment-calibration')?.close();stopAugmentCapture();
  }
});
async function openAugmentCalibration(){
  if(labActive)throw Error('Odczyt ekranu działa podczas prawdziwego meczu Mayhem.');
  const matchKey=lastState?.final?.build?.mayhem?.matchKey;if(!matchKey)throw Error('Uruchom mecz Mayhem.');
  augmentCalibrationOpen=true;
  try{
    const context=await startAugmentCapture(matchKey),frame=augmentFrameCanvas();
    let dialog=document.getElementById('augment-calibration');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='augment-calibration';document.body.appendChild(dialog);}
    let regions=[],drag=null,delayedCapture=null;
    dialog.innerHTML=`<form method="dialog"><div class="panel-head"><h2>Odczyt nazwy własnego augmentu · OCR</h2><button value="cancel">Zamknij</button></div></form>
      <p>Kliknij <b>Zdjęcie za 5 sekund</b>, wróć do gry i najedź na ikonę <b>już posiadanego augmentu</b> na swoim pasku. Po zdjęciu wróć tutaj i zaznacz prostokątem samą nazwę w dymku, bez opisu.</p>
      <p class="note">Nie wskazuj kart z propozycjami ani augmentów innych graczy. Później najedź na każdy nowy własny augment na około 3 sekundy. Nazwa musi pojawiać się w zaznaczonym obszarze. Po zmianie HUD lub rozdzielczości ustaw go ponownie. Czarne okno: użyj trybu okna bez ramek.</p>
      <canvas class="augment-calibration-canvas"></canvas><p data-vision-feedback class="note"></p>
      <div class="actions"><button type="button" data-vision-refresh>Zdjęcie za 5 sekund</button><button type="button" data-vision-undo>Wyczyść obszar</button><button type="button" data-vision-preview>Sprawdź odczyt</button><button type="button" class="primary" data-vision-save>Włącz OCR</button></div><p class="form-error" role="alert"></p>`;
    const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d');canvas.width=frame.width;canvas.height=frame.height;
    const feedback=text=>dialog.querySelector('[data-vision-feedback]').textContent=text;
    const redraw=()=>{
      ctx.drawImage(frame,0,0);ctx.strokeStyle='#3ccf8e';ctx.lineWidth=Math.max(2,frame.width/600);
      for(const r of regions)ctx.strokeRect(r.x*canvas.width,r.y*canvas.height,r.w*canvas.width,r.h*canvas.height);
      if(drag)ctx.strokeRect(drag.x*canvas.width,drag.y*canvas.height,(drag.endX-drag.x)*canvas.width,(drag.endY-drag.y)*canvas.height);
      feedback(regions.length?'Obszar wybrany. Sprawdź odczyt przed włączeniem.':'Zaznacz samą nazwę własnego augmentu. Obraz pozostaje na tym komputerze.');
    };
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
    canvas.onpointerdown=e=>{const p=point(e);drag={...p,endX:p.x,endY:p.y};canvas.setPointerCapture(e.pointerId);};
    canvas.onpointermove=e=>{if(drag){const p=point(e);drag.endX=p.x;drag.endY=p.y;redraw();}};
    canvas.onpointerup=e=>{
      if(!drag)return;const p=point(e),r={x:Math.min(drag.x,p.x),y:Math.min(drag.y,p.y),w:Math.abs(p.x-drag.x),h:Math.abs(p.y-drag.y)};drag=null;
      try{AugmentVision.validateConfig({enabled:true,width:canvas.width,height:canvas.height,regions:[r]});regions=[r];dialog.querySelector('.form-error').textContent='';}
      catch(err){dialog.querySelector('.form-error').textContent=err.message;}redraw();
    };
    dialog.querySelector('[data-vision-refresh]').onclick=()=>{
      clearTimeout(delayedCapture);feedback('Za 5 sekund: wróć do gry i najedź na swój augment.');
      delayedCapture=setTimeout(()=>{
        if(!dialog.open)return;
        try{const fresh=augmentFrameCanvas();if(fresh.width!==frame.width||fresh.height!==frame.height){regions=[];frame.width=fresh.width;frame.height=fresh.height;canvas.width=fresh.width;canvas.height=fresh.height;}
          frame.getContext('2d').drawImage(fresh,0,0);fresh.width=0;redraw();feedback('Zdjęcie gotowe. Zaznacz nazwę w dymku.');}
        catch(err){dialog.querySelector('.form-error').textContent=err.message;}
      },5000);
    };
    dialog.querySelector('[data-vision-undo]').onclick=()=>{regions=[];redraw();};
    dialog.querySelector('[data-vision-preview]').onclick=async e=>{
      e.target.disabled=true;
      try{if(!regions.length)throw Error('Najpierw zaznacz nazwę.');
        const result=await window.assist.augmentScreenPreview({matchKey,token:context.token,png:augmentTitlePng(frame,regions[0])});
        if(!result.ok)throw Error(result.error);feedback(result.status==='match'?`Rozpoznano: ${result.name}`:result.status==='ambiguous'?'Kilka nazw w obszarze — zaznacz tylko tytuł własnego augmentu.':'Brak pewnego odczytu — popraw obszar i czytelność nazwy.');}
      catch(err){dialog.querySelector('.form-error').textContent=err.message;}finally{e.target.disabled=false;}
    };
    dialog.querySelector('[data-vision-save]').onclick=async()=>{
      try{const config=AugmentVision.validateConfig({enabled:true,width:canvas.width,height:canvas.height,regions});
        const result=await window.assist.setAugmentScreen({matchKey,config});if(!result.ok)throw Error(result.error);
        dialog.close();toast('OCR włączony. Najedź na własny augment na około 3 sekundy.');}
      catch(err){dialog.querySelector('.form-error').textContent=err.message;}
    };
    dialog.onclose=()=>{clearTimeout(delayedCapture);augmentCalibrationOpen=false;canvas.width=0;canvas.height=0;frame.width=0;frame.height=0;
      if(!lastState?.final?.build?.mayhem?.screen?.enabled)stopAugmentCapture();};
    redraw();dialog.showModal();
  }catch(err){augmentCalibrationOpen=false;stopAugmentCapture();throw err;}
}
document.getElementById('app').addEventListener('click',async e=>{
  const button=e.target.closest('[data-augment-screen],[data-augment-screen-toggle],[data-augment-auto],[data-augment-undo]');if(!button)return;
  e.stopImmediatePropagation();button.disabled=true;
  try{
    if(button.hasAttribute('data-augment-undo')){
      const m=lastState.final.build.mayhem,result=await window.assist.undoAugmentRecognition({matchKey:m.matchKey,token:button.dataset.augmentUndo});
      if(!result.ok)throw Error(result.error);toast('Cofnięto rozpoznanie. Ekwipunek i pozostałe wybory zostały zachowane.');
    }
    else if(button.hasAttribute('data-augment-screen'))await openAugmentCalibration();
    else{const m=lastState.final.build.mayhem,config=button.hasAttribute('data-augment-auto')?{enabled:true,mode:'auto'}:{...m.screen.config,enabled:!m.screen.enabled};
      const result=await window.assist.setAugmentScreen({matchKey:m.matchKey,config});if(!result.ok)throw Error(result.error);stopAugmentCapture();}
  }catch(err){toast(err.message,true);}finally{button.disabled=false;}
});
