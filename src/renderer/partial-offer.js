function partialOfferView(offer){
  const positions=['Lewa','Środkowa','Prawa'];
  return `<section class="augment-comparison" data-partial-offer aria-label="Częściowy odczyt kart">
    <div class="offer-heading"><b>Rozpoznano 2 z 3 kart</b>${offer.held?'<span>Ostatni odczyt · czekam na potwierdzenie kart</span>':''}</div>
    <div class="augment-offer-grid">${offer.cards.map((card,i)=>`<article class="augment-offer"><div class="offer-position">${positions[i]}</div>
      ${card?`<b>${esc(card.name)}</b>${card.english!==card.name?`<small>${esc(card.english)}</small>`:''}`:
        `<b>Nieczytelna nazwa</b><button type="button" data-fill-offer-slot="${offer.token}" ${offer.held?'disabled':''}>Uzupełnij kartę</button>`}</article>`).join('')}</div></section>`;
}
function missedOfferView(offer){
  return `<section class="augment-comparison"><div class="offer-heading"><b>Którą kartę wybrałeś w grze?</b></div>
    <div class="augment-offer-grid">${offer.cards.map(c=>`<button type="button" data-confirm-offer-id="${c.id}" data-token="${offer.token}">${esc(c.name)}${c.english!==c.name?`<small>${esc(c.english)}</small>`:''}</button>`).join('')}</div></section>`;
}
async function fillOfferDialog(m,token){
  if(document.getElementById('fill-offer-dialog'))return;
  const partial=m.partialOffer;
  if(partial?.token!==token)return;
  const dialog=document.createElement('dialog');
  dialog.id='fill-offer-dialog';
  dialog.dataset.offer=String(token);dialog.dataset.match=m.matchKey;
  dialog.setAttribute('aria-labelledby','fill-offer-title');
  dialog.innerHTML=`<div class="panel-head"><h2 id="fill-offer-title">Uzupełnij nazwę karty</h2><button type="button" data-close>Zamknij</button></div>
    <label>Szukaj po polskiej lub angielskiej nazwie<input type="search" data-find-offer-augment autocomplete="off"></label>
    <p>Uzupełnienie nazwy otwiera porównanie trzech kart. Wybór augmentu potwierdzisz po wybraniu go w grze.</p>
    <div class="augment-results" data-fill-results></div><p role="status"></p>`;
  document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  const input=dialog.querySelector('input'), results=dialog.querySelector('[data-fill-results]'), status=dialog.querySelector('[role=status]');
  input.focus();
  try{
    const result=await window.assist.mayhemCatalog(m.pool);
    if(!result.ok)throw Error(result.error);
    const used=new Set(partial.cards.map(c=>c?.id));
    const render=()=>{
      const query=AugmentVision.normalize(input.value);
      const cards=query?result.augments.filter(a=>!used.has(a.id)&&[a.name,a.english].some(s=>AugmentVision.normalize(s).includes(query))).slice(0,12):[];
      results.innerHTML=cards.map(a=>`<button type="button" data-fill-offer-id="${a.id}">${esc(a.name)}${a.name!==a.english?` · ${esc(a.english)}`:''}</button>`).join('');
      status.textContent=query&&!cards.length?'Brak pasujących nazw.':'';
    };
    input.oninput=render;render();
    results.onclick=async e=>{
      const button=e.target.closest('[data-fill-offer-id]');if(!button)return;
      results.inert=true;
      dialog.dataset.saving='true';
      try{
        const save=await window.assist.editLiveOffer({action:'fill',matchKey:m.matchKey,token,id:Number(button.dataset.fillOfferId)});
        if(!save.ok)throw Error(save.error);
        dialog.close();
      }catch(err){status.textContent=err.message;}finally{results.inert=false;delete dialog.dataset.saving;}
    };
  }catch(err){status.textContent=err.message;}
}
window.assist.onState(state=>{
  const dialog=document.getElementById('fill-offer-dialog');
  if(!dialog?.open||dialog.dataset.saving)return;
  const m=state?.final?.build?.mayhem;
  if(m?.matchKey!==dialog.dataset.match || m?.partialOffer?.token!==Number(dialog.dataset.offer)){
    dialog.close();
    toast(m?.comparison?'Odczytano pełną ofertę kart.':'Oferta kart uległa zmianie.');
  }
});
document.getElementById('app').addEventListener('click',async event=>{
  const button=event.target.closest('[data-fill-offer-slot],[data-confirm-offer-id]');
  const m=lastState?.final?.build?.mayhem;
  if(!button||!m)return;
  if(button.hasAttribute('data-fill-offer-slot'))return fillOfferDialog(m,Number(button.dataset.fillOfferSlot));
  button.disabled=true;
  try{
    const res=await window.assist.editLiveOffer({action:'confirm',matchKey:m.matchKey,token:Number(button.dataset.token),id:Number(button.dataset.confirmOfferId)});
    if(!res.ok)throw Error(res.error);
    toast('Zapisano wybraną kartę.');
  }catch(err){toast(err.message,true);}finally{button.disabled=false;}
});
