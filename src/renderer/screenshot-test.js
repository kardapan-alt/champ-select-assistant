function openOfferScreenshotTest(){
  const dialog=document.createElement('dialog');
  dialog.id='offer-screenshot-test';
  dialog.setAttribute('aria-labelledby','offer-test-heading');
  dialog.innerHTML=`<form method="dialog"><div class="panel-head"><h2 id="offer-test-heading">Test kart ze zrzutu</h2><button>Zamknij</button></div></form>
    <p>Wybierz pełny zrzut okna gry z trzema kartami albo wklej obraz przez Ctrl+V. Test działa lokalnie.</p>
    <div class="actions"><button type="button" data-choose-image>Wybierz PNG lub JPG</button><input type="file" accept="image/png,image/jpeg" hidden></div>
    <p role="status" aria-live="polite"></p><div class="screenshot-slots"></div>`;
  document.body.appendChild(dialog);
  const picker=dialog.querySelector('input'),choose=dialog.querySelector('[data-choose-image]');
  const status=dialog.querySelector('[role=status]'),slots=dialog.querySelector('.screenshot-slots');
  const pool=(!labActive && lastState?.final?.build?.mayhem?.pool)||'auto';
  let busy=false;

  async function readImage(selected){
    if(busy||!selected)return;
    slots.replaceChildren();
    delete status.dataset.result;
    if(!['image/png','image/jpeg'].includes(selected.type)||selected.size>25*1024*1024){
      status.textContent='Wybierz obraz PNG lub JPG o rozmiarze do 25 MB.';return;
    }
    busy=true;choose.disabled=true;
    status.textContent='Odczytuję nazwy kart z obrazu…';
    let image;
    try{
      image=await createImageBitmap(selected);
      if(!dialog.open)return;
      const {width,height}=image;
      if(width<640||height<400||width>10000||height>10000||width*height>40000000)
        throw Error('Wybierz pełny zrzut okna gry w rozdzielczości od 640 × 400 do 40 megapikseli.');
      const {png,grid}=augmentOfferFrame(image);
      const result=await window.assist.testOfferScreenshot({width,height,png,grid,pool});
      if(!dialog.open)return;
      if(!result.ok)throw Error(result.error);
      const messages={
        offer:'Odczyt gry potwierdza trzy karty na tej klatce. Do sprawdzenia kliknięcia potrzebny jest przebieg wyboru w grze.',
        incomplete:result.confirmedPair?`Rozpoznano dwie karty i pozycję trzeciej. W meczu możesz uzupełnić jej nazwę ${compactViewHint(lastState?.compactShortcutLabel)}.`:'Odczyt gry nie potwierdził układu kart. Porównaj wycinki tytułów z tekstem odczytanym przez Windows.',
        empty:'Obraz jest zbyt ciemny lub jednolity. Użyj zrzutu bezpośrednio z okna gry.',
        language:'Dodaj polski lub angielski pakiet OCR w ustawieniach języka Windows i spróbuj ponownie.',
        error:'Windows OCR nie odpowiedział. Wczytaj zrzut ponownie.'
      };
      status.textContent=messages[result.status];
      status.dataset.result=result.status;
      result.slots.forEach((slot,index)=>{
        const entry=document.createElement('article');
        const position=['Lewa','Środkowa','Prawa'][index];
        entry.innerHTML=`<h3>${position}</h3><canvas role="img" aria-label="Wycinek tytułu – ${position.toLowerCase()} karta"></canvas>
          <b>${esc(slot.name||(slot.ambiguous?'Kilka możliwych nazw':'Brak dopasowania'))}</b>
          ${slot.english&&slot.english!==slot.name?`<small lang="en">${esc(slot.english)}</small>`:''}
          <p>Tekst OCR · ${esc(slot.readings.join(' / ')||'brak')}</p>`;
        const canvas=entry.querySelector('canvas'),r=slot.region;
        canvas.width=Math.max(1,Math.round(width*r.w));canvas.height=Math.max(1,Math.round(height*r.h));
        canvas.getContext('2d').drawImage(image,r.x*width,r.y*height,r.w*width,r.h*height,0,0,canvas.width,canvas.height);
        slots.appendChild(entry);
      });
    }catch(err){
      if(dialog.open)status.textContent=err.name==='InvalidStateError'?'Nie można otworzyć tego obrazu. Wybierz poprawny plik PNG lub JPG.':err.message;
    }finally{
      image?.close();busy=false;choose.disabled=false;picker.value='';
    }
  }
  choose.onclick=()=>picker.click();
  picker.onchange=()=>readImage(picker.files[0]);
  dialog.onpaste=event=>{
    const pasted=Array.from(event.clipboardData?.items||[]).find(item=>item.kind==='file'&&item.type.startsWith('image/'));
    if(pasted){event.preventDefault();readImage(pasted.getAsFile());}
  };
  dialog.onclose=()=>dialog.remove();
  dialog.showModal();
}
document.getElementById('app').addEventListener('click',e=>{
  if(e.target.closest('[data-test-offer-screenshot]'))openOfferScreenshotTest();
});
