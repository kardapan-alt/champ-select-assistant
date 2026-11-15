function mayhemPanel(b) {
  if (!b?.mayhem) return '';
  const m = b.mayhem, canEdit = labActive || !!m.matchKey;
  const selected = m.hints || [];
  return `<section class="mayhem-summary"><div class="panel-head"><b>ARAM: Mayhem</b><button data-mayhem-editor ${canEdit ? '' : 'disabled'}>Augmenty i ekwipunek</button></div>
    <div class="augment-chips">${selected.length ? selected.map(a => `<span class="tag ${a.supported ? 'good' : ''}" title="${esc(a.summary)}">${esc(a.name)}${a.completed ? ' ✓' : ''}</span>`).join('') : '<span class="muted">Augmenty zaznaczysz ręcznie po rozpoczęciu gry.</span>'}</div>
    ${m.nextItem && selected.length ? `<p class="next-purchase">Następny przedmiot: <b>${esc(m.nextItem.name)}</b></p>` : ''}
    ${m.unknown.length ? `<p class="note">${m.unknown.length} augmentów bez reguły zakupów — możesz wskazać ich efekt w edytorze.</p>` : ''}
    ${selected.length ? disclosure('augment-reasons', 'Wpływ augmentów na zakupy', selected.map(a => `<p><b>${esc(a.name)}:</b> ${esc(a.summary)}${!a.supported ? ' Automatyczna kolejność pozostaje bez zmian dla tego augmentu.' : ''}</p>`).join('')) : ''}
  </section>`;
}

async function openMayhemEditor() {
  const build = currentBuild(), wasLab = labActive;
  if (build?.mode !== 'mayhem') return;
  let revision = labRevision;
  const context = wasLab
    ? { ...(await window.assist.mayhemCatalog('KIWI')), selection:labView.mayhem || {}, items:labView.catalog, alias:build.alias }
    : await window.assist.getMayhem();
  if (!context.ok) throw Error(context.error);
  if (wasLab !== labActive || (wasLab && revision !== labRevision) || currentBuild()?.alias !== build.alias) throw Error('Draft się zmienił. Otwórz augmenty ponownie.');
  const selection = JSON.parse(JSON.stringify({ augments:[],completed:[],owned:[],ownedBoots:null,effects:{},...context.selection }));
  const chosen = new Map(context.augments.map(a => [a.id,a]));
  let dialog = document.getElementById('mayhem-dialog');
  if (!dialog) { dialog=document.createElement('dialog');dialog.id='mayhem-dialog';document.body.appendChild(dialog); }
  const options = (list,id) => '<option value="0">Brak / jeszcze nie kupiony</option>' + list.map(i => `<option value="${i.id}" ${i.id === id ? 'selected' : ''}>${esc(i.name)}</option>`).join('');
  dialog.innerHTML = `<form id="mayhem-form"><div class="panel-head"><h2>Mayhem · ${esc(build.name)}</h2><button type="button" data-mayhem-cancel>Zamknij</button></div>
    <p class="muted">${wasLab ? 'Symulacja — wybory nie zmienią trwającego meczu.' : 'Wybory dotyczą tylko tego meczu. Zaznacz augmenty otrzymane w grze.'}</p>
    <div id="mayhem-selected"></div><label class="augment-search">Szukaj augmentu po polskiej lub angielskiej nazwie<input type="search" id="augment-search" placeholder="np. Goliath, Apex Inventor…" autocomplete="off"></label>
    <div id="augment-results" class="augment-results"></div>
    <details class="owned-editor"><summary>Już kupione przedmioty · ${selection.owned.length} + buty</summary>
      <p class="muted">Zaznacz ukończone przedmioty, bez komponentów. Zostaną w buildzie; pozostałe miejsca dopasują się do augmentów. Po sprzedaży lub połączeniu w nagrodę zaktualizuj tę listę.</p>
      <div class="choice-grid">${Array.from({length:5},(_,i) => `<label>Posiadany przedmiot ${i+1}<select name="owned-${i}">${options(context.items.items,selection.owned[i])}</select></label>`).join('')}
      <label>Posiadane buty<select name="owned-boots">${options(context.items.boots,selection.ownedBoots)}</select></label></div></details>
    <p class="form-error" role="alert"></p><div class="actions"><button class="primary" type="submit">Zastosuj i przelicz build</button><span class="muted">${context.augments.length} augmentów · katalog ${esc(context.fetched)}</span></div></form>`;
  const error = message => { dialog.querySelector('.form-error').textContent=message; };
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ł/g,'l');
  const renderSelected = () => {
    dialog.querySelector('#mayhem-selected').innerHTML = `<h4>Wybrane augmenty: ${selection.augments.length}/5</h4>${selection.augments.map(id => {
      const a=chosen.get(id); if(!a)return '';
      const manual=Object.hasOwn(selection.effects,id), value=manual ? selection.effects[id][0] || 'none' : 'auto';
      return `<div class="selected-augment"><div><b>${esc(a.name)}</b> <span class="muted">${esc(a.english)}</span><button type="button" data-remove-augment="${id}" aria-label="Usuń ${esc(a.name)}">×</button></div>
        <p class="note">${esc(a.summary)}</p>${a.quest ? `<label><input type="checkbox" data-quest-completed="${id}" ${selection.completed.includes(id) ? 'checked' : ''}> Zadanie ukończone — nie proponuj ponownie składników nagrody</label>` : ''}
        <label>Wpływ na zakupy<select data-augment-effect="${id}"><option value="auto" ${value==='auto'?'selected':''}>${a.supported ? 'Automatycznie z reguły augmentu' : 'Bez reguły — zachowaj bazowy build'}</option><option value="none" ${value==='none'?'selected':''}>Bez dodatkowego priorytetu</option>${Object.entries(context.effects).map(([k,v]) => `<option value="${k}" ${value===k?'selected':''}>Ręcznie: ${esc(v)}</option>`).join('')}</select></label></div>`;
    }).join('')}`;
  };
  const renderResults = () => {
    const q=normalize(dialog.querySelector('#augment-search').value);
    const matches=context.augments.filter(a => normalize(a.name+' '+a.english).includes(q));
    const results=matches.slice(0,30);
    dialog.querySelector('#augment-results').innerHTML=results.map(a=>`<label class="augment-option"><input type="checkbox" data-augment-id="${a.id}" ${selection.augments.includes(a.id)?'checked':''}><span><b>${esc(a.name)}</b><small>${esc(a.english)} · ${a.rarity==='kPrismatic'?'Pryzmatyczny':a.rarity==='kGold'?'Złoty':'Srebrny'}${a.supported?'':' · bez reguły zakupów'}</small></span></label>`).join('') + (matches.length>30 ? '<p class="note">Wpisz nazwę, żeby zawęzić listę.</p>' : !matches.length ? '<p class="note">Brak wyników. Spróbuj nazwy angielskiej.</p>' : '');
  };
  dialog.querySelector('#augment-search').oninput=renderResults;
  dialog.querySelector('[data-mayhem-cancel]').onclick=()=>dialog.close();
  dialog.onchange=e=>{
    const t=e.target;
    if(t.dataset.augmentId){
      const id=Number(t.dataset.augmentId);
      if(t.checked && selection.augments.length>=5){t.checked=false;error('Możesz zaznaczyć maksymalnie 5 augmentów.');return;}
      selection.augments=t.checked?[...selection.augments,id]:selection.augments.filter(x=>x!==id);
      if(!t.checked){selection.completed=selection.completed.filter(x=>x!==id);delete selection.effects[id];}
      error('');renderSelected();
    } else if(t.dataset.questCompleted){
      const id=Number(t.dataset.questCompleted);selection.completed=t.checked?[...selection.completed,id]:selection.completed.filter(x=>x!==id);
    } else if(t.dataset.augmentEffect){
      const id=Number(t.dataset.augmentEffect);if(t.value==='auto')delete selection.effects[id];else selection.effects[id]=t.value==='none'?[]:[t.value];
    }
  };
  dialog.onclick=e=>{
    const button=e.target.closest('[data-remove-augment]');if(!button)return;
    const id=Number(button.dataset.removeAugment);selection.augments=selection.augments.filter(x=>x!==id);selection.completed=selection.completed.filter(x=>x!==id);delete selection.effects[id];renderSelected();renderResults();
  };
  dialog.querySelector('form').onsubmit=async e=>{
    e.preventDefault();const button=dialog.querySelector('[type=submit]');button.disabled=true;error('');
    try {
      if(wasLab!==labActive || currentBuild()?.alias!==build.alias || (wasLab && revision!==labRevision))throw Error('Draft się zmienił. Otwórz augmenty ponownie.');
      const values=new FormData(e.target);
      selection.owned=Array.from({length:5},(_,i)=>Number(values.get(`owned-${i}`))).filter(Boolean);
      selection.ownedBoots=Number(values.get('owned-boots'))||null;
      if(wasLab){
        const nextRevision=++labRevision, next={...labInput,mayhem:selection};revision=nextRevision;
        const result=await window.assist.previewDraft(next);
        if(!labActive || nextRevision!==labRevision)throw Error('Draft się zmienił. Otwórz augmenty ponownie.');
        if(!result.ok)throw Error(result.error);
        labInput=next;labView=result;renderLabResults();
      }else{
        const result=await window.assist.setMayhem({matchKey:context.matchKey,selection});if(!result.ok)throw Error(result.error);
      }
      dialog.close();toast('Build dopasowany do augmentów i posiadanych przedmiotów');
    }catch(err){error(err.message);}finally{button.disabled=false;}
  };
  renderSelected();renderResults();dialog.showModal();
}
document.getElementById('app').addEventListener('click',async e=>{
  const button=e.target.closest('[data-mayhem-editor]');if(!button)return;
  e.stopImmediatePropagation();button.disabled=true;
  try{await openMayhemEditor();}catch(err){toast(err.message,true);}finally{button.disabled=false;}
});
