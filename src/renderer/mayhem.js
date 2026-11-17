function augmentGrade(rating){
  return `<div class="augment-rating" title="${esc(rating?.reason||'Brak wystarczających danych do oceny dopasowania.')}" aria-label="Ocena dopasowania ${esc(rating?.grade||'brak')}"><span>Ocena dla Ciebie</span><strong class="grade-${esc(rating?.grade||'none')}">${esc(rating?.grade||'—')}</strong></div>`;
}
function augmentItemEvidence(interaction){
  if(!interaction)return '<p class="note">Dopasowanie zakupów według profilu postaci. Brak osobno sprawdzonej interakcji z przedmiotem.</p>';
  const examples=interaction.examples.map(item=>`<li><b>${esc(item.name)}</b> · ${esc(item.effect)}</li>`).join('');
  return `<p>${esc(interaction.mechanic)}</p>${interaction.purchase?`<p>${esc(interaction.purchase)}</p>`:''}
    ${examples?`<p>Przykładowe przedmioty z tym efektem</p><ul>${examples}</ul>`:''}
    <p class="note" title="${esc(interaction.descriptionKey)}">Źródło · opis karty w danych gry Riot (CommunityDragon)${examples?' i opisy przedmiotów w Data Dragon':''}, patch ${esc(interaction.patch)}.</p>
    ${interaction.otherPatch?`<p class="offer-warning">Klient używa patcha ${esc(interaction.otherPatch)}. Ta interakcja czeka na ponowne sprawdzenie.</p>`:''}`;
}
function activationView(activation){
  if(!activation)return '';
  return `<div class="activation-cost" data-activation-cost><strong>${esc(activation.label)}</strong>${(activation.details||[]).map(line=>`<small>${esc(line)}</small>`).join('')}${activation.impact?`<small>${esc(activation.impact)}</small>`:''}</div>`;
}
function questProgressView(quests){
  if(!quests?.length)return '';
  return `<section class="mayhem-quests" aria-label="Postęp zadań Mayhem"><b>Zadania Mayhem</b>${quests.map(q=>`<article data-quest-progress="${q.id}"><strong>${esc(q.name)}</strong> · ${esc(q.status)}${q.rows.map(row=>`<small>${esc(row.name)} · ${row.held?'posiadasz':!q.known?'brak odczytu':q.exact&&row.cost!==null?`pozostało ${row.cost} zł`:'do zdobycia'}${row.components?.length?' · masz '+row.components.map(esc).join(', '):''}</small>`).join('')}</article>`).join('')}</section>`;
}
function mayhemChoiceView(m,compact=false){
  if(!m||labActive||!m.matchKey)return '';
  const comparison=m.comparison;
  let cards='';
  if(comparison){
    if(compact){
      cards=`<section class="augment-comparison" aria-label="Trzy karty augmentów"><div class="offer-heading"><b>Trzy karty do wyboru</b><span>${comparison.paused?'Ostatnia oferta z gry':'Kolejność jak w grze'}</span></div>
        <div class="augment-offer-grid">${comparison.cards.map((c,i)=>`<article class="augment-offer" data-offer-id="${c.id}"><div class="offer-position">${['Lewa','Środkowa','Prawa'][i]}</div><b>${esc(c.name)}</b>${c.english&&c.english!==c.name?`<small>${esc(c.english)}</small>`:''}${augmentGrade({grade:c.grade,reason:c.warnings[0]||c.reasons[0]})}${activationView(c.activation)}</article>`).join('')}</div></section>`;
    }else cards=augmentComparison(comparison);
  }
  const saved=m.undo?`<div class="augment-receipt"><span>Ostatnio zapisano <b>${m.undo.names.map(esc).join(', ')}</b></span><button class="augment-undo" data-augment-undo="${esc(m.undo.token)}" title="Cofa ostatni zapis w asystencie">Cofnij odczyt</button></div>`:'';
  const missed=m.screen?.missed?'<div class="augment-receipt offer-warning"><span>Jeśli wybrałeś już kartę, uzupełnij jej zapis.</span><button data-mayhem-editor>Uzupełnij wybór</button></div>':'';
  return cards+missed+saved+questProgressView(m.quests);
}
function mayhemPanel(b) {
  if (!b?.mayhem) return '';
  const m = b.mayhem, canEdit = labActive || !!m.matchKey;
  const selected = m.hints || [];
  const live = m.live;
  const liveText = { live:'Ekwipunek wykrywany automatycznie', waiting:'Czekam na dane ekwipunku z gry', stale:'Brak połączenia z grą — ostatni odczyt ekwipunku', manual:'Ekwipunek ustawiany ręcznie' };
  const screenText={off:'Odczyt augmentów wyłączony',waiting:'Czekam na czytelny obraz gry',paused:'Odczyt ruszy po powrocie do okna gry',scanning:'Automatyczne augmenty · czekam na karty wyboru',offers:'Karty rozpoznane · wybierz augment w grze',confirming:'Potwierdzam wybrany augment',detected:'Augment rozpoznany · build przeliczony',reading:'Czytam nazwę · zapis po 3 zgodnych odczytach',ambiguous:'Kilka nazw w obszarze — popraw ustawienie OCR',unreadable:'Najedź na własny augment na około 3 sekundy',layout:'Rozdzielczość się zmieniła — ustaw OCR ponownie',conflict:'Niejednoznaczny zestaw — sprawdź augmenty ręcznie',language:'Brak polskiego lub angielskiego OCR w Windows'};
  screenText.undone='Rozpoznanie cofnięte · możesz wskazać poprawny augment w edytorze';
  screenText['capture-error']=m.screen?.error||'Nie udało się przechwycić obrazu gry';
  screenText['ocr-error']='OCR nie odpowiada · ponawiam odczyt';
  screenText['unreadable-frame']='Otrzymuję pusty lub nieczytelny obraz. Ustaw w grze okno bez ramek.';
  screenText['partial']='Czytam nazwy, ale jeszcze nie potwierdziłem trzech kart';
  screenText['reading-offers']='Trzy karty odczytane · potwierdzam obraz';
  screenText.missed='Ostatni wybór wymaga potwierdzenia';
  return `<section class="mayhem-summary"><div class="panel-head"><b>ARAM: Mayhem</b><button data-mayhem-editor ${canEdit ? '' : 'disabled'}>Augmenty i ekwipunek</button></div>
    ${m.headliner?`<div class="headliner-tip"><b>Headliner ${m.headlinerDetection?.source==='screen'?'· wykryty automatycznie':''}: ${esc(m.headliner.name)}${m.headliner.ability?' · '+esc(m.headliner.ability):''}</b><p>${esc(m.headliner.tip)}</p>${m.headliner.warning?`<p class="bad">${esc(m.headliner.warning)}</p>`:''}</div>`:`<p class="note">${m.headlinerDetection?.auto ? m.headlinerDetection.available ? 'Headliner: czekam na nazwę i opis wydarzenia w obrazie gry.' : 'Headliner: włącz automatyczny OCR, aby wykrywać go z ekranu.' : 'Headlinera ustawisz w „Augmenty i ekwipunek”.'}</p>`}
    ${live && !b.readout ? `<p class="live-inventory-status ${live.status==='live'?'good':'muted'}">${esc(liveText[live.status] || liveText.waiting)}</p>` : ''}
    ${m.screen && !labActive ? `<div class="augment-screen-controls"><span>${esc(screenText[m.screen.status] || screenText.waiting)}${m.screen.diagnostics?.readMs?` · OCR ${Math.round(m.screen.diagnostics.readMs)} ms`:''}</span>${m.screen.config?.mode!=='auto'?'<button data-augment-auto>Tryb automatyczny</button>':''}<button data-augment-screen-toggle>${m.screen.enabled?'Wyłącz':'Włącz'}</button><button data-test-offer-screenshot>Test kart ze zrzutu</button></div>` : ''}
    ${selected.length||!m.comparison?`<div class="augment-chips">${selected.length ? selected.map(a => `<article class="selected-augment-card" data-selected-augment="${a.id}"><b title="${esc(a.summary)}">${esc(a.name)}${a.completed?' ✓':''}</b><small>${esc(a.english)}</small>${augmentGrade(a.rating)}<p>${esc(a.rating?.reason||a.summary)}</p>${(a.requiredItems||[]).map(i=>`<p class="augment-required-item">${esc(i.status==='owned'?'Już kupiony':i.status==='planned'?'W buildzie':'Poza planem')}: <b>${esc(i.name)}</b>${i.status==='outside'?' · sprawdź wolne sloty i przypięcia':''}</p>`).join('')}</article>`).join('') : '<span class="muted">Czekam na nowe karty wyboru w oknie gry. Wcześniej pominięte augmenty dodasz przez „Augmenty i ekwipunek”. Odczyt augmentów nie wymaga rozpoznania Headlinera.</span>'}</div>${selected.length?'<p class="offer-note">Dopasowanie w tym buildzie: S → A → B → C → D → E → F. „—” = brak oceny, nie słaby augment.</p>':''}`:''}
    ${m.nextItem && !b.shop ? `<p class="next-purchase">${m.nextItem.upgrade?'Ulepsz posiadany przedmiot do':'Następny przedmiot'}: <b>${esc(m.nextItem.name)}</b>${m.nextItem.components ? ` · masz komponenty za ${m.nextItem.components.credit} złota, do ukończenia ${m.nextItem.components.remaining}` : ''}</p>` : ''}
    ${live?.auto && live.inventory ? disclosure('live-inventory', 'Odczytany ekwipunek · '+live.inventory.items.length+' zajętych slotów', live.inventory.items.length ? `<div class="live-items">${live.inventory.items.map(i=>`<span class="tag" title="${esc(i.name)}">${i.icon?`<img src="${esc(i.icon)}" alt="">`:''}${esc(i.name)}${i.count>1?' ×'+i.count:''}${i.kind==='component'?' · komponent':i.kind==='unknown'?' · poza katalogiem':''}</span>`).join('')}</div><p class="note">Gotowe przedmioty zostają w buildzie. Komponenty i mikstury są śledzone osobno.</p>` : '<p class="note">Ekwipunek jest pusty.</p>') : ''}
    ${live?.auto && live.inventory?.items.some(i=>i.kind==='unknown') ? '<p class="note">Przedmiot spoza katalogu: widoczny w odczycie, ale jeszcze nieuwzględniony w planie zakupów.</p>' : ''}
    ${m.unknown.length ? `<p class="note">${m.unknown.length} augmentów bez reguły zakupów — możesz wskazać ich efekt w edytorze.</p>` : ''}
    ${selected.length ? disclosure('augment-reasons', 'Jak augmenty działają z przedmiotami?', selected.map(a => `<h4>${esc(a.name)}</h4>${augmentItemEvidence(a.interaction)}<p class="note">Reguła zakupów · ${esc(a.summary)}</p>`).join('')) : ''}
    ${m.synergies?.length?disclosure('augment-pairs','Synergie wybranych augmentów',m.synergies.map(p=>`<p><b>${esc(p.names.join(' + '))}</b><br>${esc(p.text)}</p>`).join('')):''}
  </section>`;
}

function augmentComparison(comparison){
  const status={strong:'Dużo synergii',fit:'Pasuje do buildu',conditional:'Warunkowe',independent:'Efekt niezależny od buildu',unknown:'Brak oceny',conflict:'Konflikt',selected:'Już wybrany'};
  return `<section class="augment-comparison" aria-label="Porównanie oferowanych augmentów"><div class="offer-heading"><b>Trzy karty do wyboru</b><span>${comparison.paused?'Ostatni odczyt · wróć do gry, aby odświeżyć':'Kolejność jak w grze'}</span></div>
    <div class="augment-offer-grid">${comparison.cards.map((c,i)=>`<article class="augment-offer ${c.recommended?'recommended':''}" data-offer-id="${c.id}">
      <div class="offer-position">${['Lewa','Środkowa','Prawa'][i]} · ${esc(c.recommended?'Najwięcej synergii':status[c.status]||status.unknown)}</div>
      <b title="${esc(c.english)}">${esc(c.name)}</b>
      ${augmentGrade({grade:c.grade,reason:c.warnings[0]||c.reasons[0]})}
      ${activationView(c.activation)}
      <p class="${c.warnings.length?'offer-warning':''}">${esc(c.warnings[0]||c.reasons[0]||'Sprawdź opis efektu.')}</p>
      ${disclosure('offer-'+c.id,'Dlaczego?',`${augmentItemEvidence(c.interaction)}<p>Reguła zakupów · ${esc(c.summary)}</p>${c.fit?`<dl class="augment-fit"><dt>Postać</dt><dd>${esc(c.fit.champion)}</dd><dt>Już kupione</dt><dd>${esc(c.fit.owned.join(', ')||'Brak bezpośredniego dopasowania')}</dd><dt>Planowane</dt><dd>${esc(c.fit.planned.join(', ')||'Brak bezpośredniego dopasowania')}</dd><dt>Inne augmenty</dt><dd>${(c.synergies||[]).map(p=>esc(p.names.join(' + ')+': '+p.text)).join('<br>')||'Brak potwierdzonej interakcji efektów'}</dd></dl>`:''}${c.reasons.map(r=>`<p>${esc(r)}</p>`).join('')}${c.warnings.map(w=>`<p class="offer-warning">${esc(w)}</p>`).join('')}`)}
    </article>`).join('')}</div><p class="offer-note">${esc(comparison.note)}</p></section>`;
}

async function openMayhemEditor() {
  const build = currentBuild(), wasLab = labActive;
  if (build?.mode !== 'mayhem') return;
  let revision = labRevision, headlinerEdited=false;
  const context = wasLab
    ? { ...(await window.assist.mayhemCatalog(labInput.context?.pool || 'KIWI')), selection:labView.mayhem || {}, items:labView.catalog, alias:build.alias }
    : await window.assist.getMayhem();
  if (!context.ok) throw Error(context.error);
  if (wasLab !== labActive || (wasLab && revision !== labRevision) || currentBuild()?.alias !== build.alias) throw Error('Draft się zmienił. Otwórz augmenty ponownie.');
  const selection = JSON.parse(JSON.stringify({ augments:[],completed:[],owned:[],ownedBoots:null,effects:{},...context.selection }));
  const chosen = new Map(context.augments.map(a => [a.id,a]));
  let dialog = document.getElementById('mayhem-dialog');
  if (!dialog) { dialog=document.createElement('dialog');dialog.id='mayhem-dialog';document.body.appendChild(dialog); }
  const options = (list,id) => '<option value="0">Brak / jeszcze nie kupiony</option>' + list.map(i => `<option value="${i.id}" ${i.id === id ? 'selected' : ''}>${esc(i.name)}</option>`).join('');
  dialog.innerHTML = `<form id="mayhem-form"><div class="panel-head"><h2>Mayhem · ${esc(build.name)}</h2><button type="button" data-mayhem-cancel>Zamknij</button></div>
    <p class="muted">${wasLab ? 'Symulacja — wybory nie zmienią trwającego meczu.' : 'Wybory dotyczą tylko tego meczu. Zaznacz augmenty otrzymane w grze.'} Wpływ na zakupy dobieram automatycznie.</p>
    <div class="headliner-editor">${wasLab?'':`<label><input name="auto-headliner" type="checkbox" ${context.autoHeadliner?'checked':''}> Automatycznie wykrywaj Headlinera z obrazu gry</label><p class="note">Wymaga włączonego automatycznego OCR. Czytam widoczną nazwę i opis wydarzenia; bez najeżdżania i kalibracji. Ręczny wybór wyłącza wykrywanie w tym meczu.</p>`}<label>Headliner · opcjonalna korekta<select name="headliner"><option value="">Jeszcze nie wybrany / nie wiem</option>${(context.headliners||[]).map(h=>`<option value="${h.id}" ${selection.headliner?.id===h.id?'selected':''}>${esc(h.name)}</option>`).join('')}</select></label><label id="headliner-ability" ${selection.headliner?.id==='pentakill'?'':'hidden'}>Wzmacniana umiejętność<select name="headliner-ability"><option value="">Nie wiem</option>${['Q','W','E','R'].map(k=>`<option ${selection.headliner?.ability===k?'selected':''}>${k}</option>`).join('')}</select></label><p id="headliner-description" class="note"></p></div>
    <div id="mayhem-selected"></div><label class="augment-search">Szukaj augmentu po polskiej lub angielskiej nazwie<input type="search" id="augment-search" placeholder="np. Goliath, Apex Inventor…" autocomplete="off"></label>
    <div id="augment-results" class="augment-results"></div>
    <details class="owned-editor"><summary>Odczyt ekwipunku${wasLab ? ' · symulacja' : ''}</summary>
      ${wasLab ? '' : `<label><input type="checkbox" name="auto-inventory" ${context.autoInventory?'checked':''}> Automatycznie wykrywaj zakupy, sprzedaż i ulepszenia</label><p class="note">Odczyt działa w trakcie meczu. Wyłącz go, jeśli chcesz podać ekwipunek ręcznie. Augmenty i ukończenie ich zadań zaznaczasz powyżej.</p>`}
      <fieldset class="manual-inventory" ${!wasLab && context.autoInventory?'disabled':''}><p class="muted">Zaznacz ukończone przedmioty, bez komponentów. Zostaną w buildzie; pozostałe miejsca dopasują się do augmentów.</p>
      <div class="choice-grid">${Array.from({length:5},(_,i) => `<label>Posiadany przedmiot ${i+1}<select name="owned-${i}">${options(context.items.ownedItems || context.items.items,selection.owned[i])}</select></label>`).join('')}
      <label>Posiadane buty<select name="owned-boots">${options(context.items.ownedBoots || context.items.boots,selection.ownedBoots)}</select></label></div></fieldset></details>
    <p class="form-error" role="alert"></p><div class="actions"><button class="primary" type="submit">Zastosuj i przelicz build</button><span class="muted">${context.augments.length} augmentów · katalog ${esc(context.fetched)}</span></div></form>`;
  const error = message => { dialog.querySelector('.form-error').textContent=message; };
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ł/g,'l');
  const renderSelected = () => {
    dialog.querySelector('#mayhem-selected').innerHTML = `<h4>Wybrane augmenty: ${selection.augments.length} · również dodatkowe z Headlinera</h4>${selection.augments.map(id => {
      const a=chosen.get(id); if(!a)return '';
      const manual=Object.hasOwn(selection.effects,id), value=manual ? selection.effects[id][0] || 'none' : 'auto';
      return `<div class="selected-augment"><div><b>${esc(a.name)}</b> <span class="muted">${esc(a.english)}</span><button type="button" data-remove-augment="${id}" aria-label="Usuń ${esc(a.name)}">×</button></div>
        <p class="note">${esc(a.summary)}</p>${a.quest ? context.questReceipts?.includes(id) ? '<p>Nagroda potwierdzona w ekwipunku</p>' : `<label><input type="checkbox" data-quest-completed="${id}" ${selection.completed.includes(id) ? 'checked' : ''}> Potwierdzam ukończenie zadania</label>` : ''}
        <details ${manual?'open':''}><summary>${manual?'Własna korekta aktywna':'Automatyczna reguła · opcjonalna własna korekta'}</summary><label>Wpływ na zakupy<select data-augment-effect="${id}"><option value="auto" ${value==='auto'?'selected':''}>${a.supported ? 'Automatycznie z reguły augmentu' : 'Bez reguły — zachowaj bazowy build'}</option><option value="none" ${value==='none'?'selected':''}>Bez dodatkowego priorytetu</option>${Object.entries(context.effects).map(([k,v]) => `<option value="${k}" ${value===k?'selected':''}>Ręcznie: ${esc(v)}</option>`).join('')}</select></label></details></div>`;
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
    if(t.name==='auto-headliner'){headlinerEdited=true;if(t.checked){selection.headliner=null;dialog.querySelector('[name=headliner]').value='';dialog.querySelector('#headliner-ability').hidden=true;dialog.querySelector('#headliner-description').textContent='Czekam na ponowny odczyt wydarzenia w grze.';}}
    if(t.name==='headliner'||t.name==='headliner-ability'){
      headlinerEdited=true;const automatic=dialog.querySelector('[name=auto-headliner]');if(automatic)automatic.checked=false;
      const id=dialog.querySelector('[name=headliner]').value;
      selection.headliner=id?{id,ability:id==='pentakill'?dialog.querySelector('[name=headliner-ability]').value:''}:null;
      dialog.querySelector('#headliner-ability').hidden=id!=='pentakill';
      dialog.querySelector('#headliner-description').textContent=context.headliners.find(h=>h.id===id)?.tip||'';
    }
    if(t.name==='auto-inventory')dialog.querySelector('.manual-inventory').disabled=t.checked;
    if(t.dataset.augmentId){
      const id=Number(t.dataset.augmentId);
      if(t.checked && selection.augments.length>=context.maxAugments){t.checked=false;error('Limit zapisu augmentów — sprawdź wcześniejsze rozpoznania.');return;}
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
        const result=await window.assist.setMayhem({matchKey:context.matchKey,selection,headlinerEdited,autoHeadliner:values.has('auto-headliner'),autoInventory:values.has('auto-inventory'),knownScreenAugments:context.screenAugments || [],screenUndoRevision:context.screenUndoRevision||0});if(!result.ok)throw Error(result.error);
      }
      dialog.close();toast('Build dopasowany do augmentów i posiadanych przedmiotów');
    }catch(err){error(err.message);}finally{button.disabled=false;}
  };
  dialog.querySelector('#headliner-description').textContent=context.headliners?.find(h=>h.id===selection.headliner?.id)?.tip||'';
  renderSelected();renderResults();dialog.showModal();
}
document.getElementById('app').addEventListener('click',async e=>{
  const button=e.target.closest('[data-mayhem-editor]');if(!button)return;
  e.stopImmediatePropagation();button.disabled=true;
  try{await openMayhemEditor();}catch(err){toast(err.message,true);}finally{button.disabled=false;}
});
