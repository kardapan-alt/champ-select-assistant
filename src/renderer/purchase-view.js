let compactMode=false;
function compactViewHint(shortcut) {
  return shortcut ? `w małym widoku (${shortcut})` : 'w małym widoku';
}
function skipButton(model,item,restore=false,short=false) {
  const action=restore?'restore':'skip';
  const label=restore?'Cofnij pominięcie':short?'Pomiń':'Pomiń '+item.name;
  return `<button type="button" data-match-skip="${action}" data-skip-id="${item.id}" data-skip-key="${esc(model.key)}" data-skip-revision="${model.revision}" aria-label="${restore?'Przywróć':'Pomiń'} ${esc(item.name)} w tym meczu">${esc(label)}</button>`;
}
function matchSkipsPanel(b,compact=false) {
  const model=b.matchSkips;
  if (!model || labActive) return '';
  const skipped=model.entries.map(it=>`<div><b>${esc(it.name)}</b> ${skipButton(model,it,true)}
    <small>${esc(it.active ? it.replacement || 'Brak pasującego zamiennika w puli.' : 'Teraz uwzględniony przez ekwipunek, przypięcie lub quest.')}</small></div>`).join('');
  const targetId=compact ? b.shop?.target?.id : b.mayhem?.nextItem?.upgrade && b.mayhem.nextItem.id;
  const target=model.options.find(i=>i.id===targetId);
  if (!skipped && !target) return '';
  return `<div class="match-skips">${skipped?`<b>Pominięte w tym meczu</b>${skipped}`:''}
    ${target?skipButton(model,target):''}</div>`;
}
function otherSkipChoices(b) {
  const model=b.matchSkips, other=model?.options.filter(it=>it.id!==b.shop?.target?.id);
  return other?.length ? disclosure('skip-planned','Pomiń inny przedmiot w tym meczu',other.map(it=>skipButton(model,it)).join(' ')) : '';
}
document.addEventListener('click',async e=>{
  const button=e.target.closest('[data-match-skip]');
  if (!button || button.disabled) return;
  button.disabled=true;
  try {
    const result=await window.assist.editMatchSkip({key:button.dataset.skipKey,revision:Number(button.dataset.skipRevision),
      id:Number(button.dataset.skipId),action:button.dataset.matchSkip});
    if (!result.ok) throw Error(result.error);
    toast(button.dataset.matchSkip==='skip'?'Pominięto przedmiot w tym meczu.':'Cofnięto pominięcie.');
  } catch(error){toast(error.message,true);} finally {button.disabled=false;}
});
function purchaseControls(b,compact=false){
  const g=b.purchaseGoal;if(!g||labActive)return '';
  const canEdit=g.canEdit&&freshRead(b.readout?.inventory);
  return `<div class="purchase-controls">${g.id?`<div><b>Przypięty cel: ${esc(g.name)}</b> <button data-unpin-next>Odblokuj</button></div>`
    :compact?`${b.shop?.target?`<button data-pin-next="${b.shop.target.id}" ${canEdit?'':'disabled'}>Zbieram na ${esc(b.shop.target.name)}</button>`:''}`:''}
    ${!compact?`<label>Zbieram na <select data-next-choice ${canEdit?'':'disabled'}><option value="">${g.id?'Zmień przypięty cel…':'Automatyczny plan · wybierz cel…'}</option>${g.options.map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></label>`:''}
    ${g.notice?`<p class="note">${esc(g.notice)}</p>`:''}
    ${g.suggestion&&!compact?`<p class="goal-alternative">Plan automatyczny proponuje ${esc(g.suggestion.name)}: ${esc(g.suggestion.why)}. Twój cel pozostaje przypięty.</p>`:''}</div>`;
}
async function setNextPurchase(id){
  const b=lastState?.final?.build,g=b?.purchaseGoal;if(!g)return;
  const result=await window.assist.setNextPurchase({key:g.key,revision:g.revision,id});
  if(!result.ok)throw Error(result.error);
  toast(id===null?'Automatyczny plan przywrócony':'Cel zakupu przypięty na ten mecz');
}
document.addEventListener('change',e=>{
  if(e.target.matches('[data-next-choice]')&&e.target.value){
    const select=e.target;select.disabled=true;
    setNextPurchase(Number(select.value)).catch(e=>toast(e.message,true)).finally(()=>{select.value='';select.disabled=false;});
  }
});
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-pin-next],[data-unpin-next]');if(!button)return;
  button.disabled=true;
  setNextPurchase(button.hasAttribute('data-unpin-next')?null:Number(button.dataset.pinNext)).catch(e=>toast(e.message,true)).finally(()=>{button.disabled=false;});
});
function dataFreshnessBadge(){
  const d=lastState?.dataStatus;
  return d&&!labActive?`<button data-data-status class="data-freshness ${d.warning?'readout-warning':''}">${esc(d.summary)}</button>`:'';
}
function showDataStatus(){
  const d=lastState?.dataStatus;if(!d)return;
  let dialog=document.getElementById('data-status-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='data-status-dialog';document.body.appendChild(dialog);}
  const date=v=>typeof v==='number'?new Date(v).toLocaleString('pl-PL'):v;
  dialog.innerHTML=`<div class="panel-head"><h2>Aktualność danych</h2><button data-close-data>Zamknij</button></div>
    <p>${d.version?'Wersja gry według klienta: '+esc(d.version):'Nie potwierdzono aktualnego patcha klienta.'}</p>
    ${d.rows.map(r=>`<article class="data-source"><b>${esc(r.name)}</b><span class="${r.status==='different'?'readout-warning':'muted'}">${esc({client:'Z lokalnego klienta',match:'Zgodny numer patcha',different:'Inny patch — wymaga sprawdzenia',unknown:'Zgodność niepotwierdzona'}[r.status])}</span><p>${r.patch?'Patch '+esc(r.patch):'Brak numeru patcha'}${r.date?' · '+esc(date(r.date)):''}</p><p>${esc(r.detail)}</p></article>`).join('')}
    <p class="note">Numer patcha i data pobrania nie gwarantują poprawności każdej porady. Reguły wbudowane otrzymujesz wraz z aktualizacją aplikacji.</p>`;
  dialog.querySelector('[data-close-data]').onclick=()=>dialog.close();dialog.showModal();
}
document.addEventListener('click',e=>{if(e.target.closest('[data-data-status]'))showDataStatus();});
function compactScreen(s){
  const b=s.final?.build||s.build;
  if(!b)return `<section class="compact-empty"><h2>${s.status==='loading'?'Łączenie z klientem…':'Czekam na Twoją grę'}</h2><p>Zakup i najważniejsza porada pojawią się po odczycie postaci.</p>${s.recentMatch?recentMatchCard(s.recentMatch):''}${dataFreshnessBadge()}</section>`;
  const fresh=freshRead(b.readout?.inventory),alt=fresh?b.shop?.comparison?.find(o=>o.target.id===b.purchaseGoal?.suggestion?.id)||b.shop?.comparison?.find(o=>o.kind!=='plan'):null;
  const tip=b.mayhem?.headliner?.warning||b.situations?.find(x=>x.inBuild)?.answer||b.situations?.[0]?.answer||b.mayhem?.hints?.[0]?.summary||b.shop?.target?.why||b.notes?.[0];
  return `<section class="compact-content"><h2>${esc(b.name)} <small>${esc(b.mode==='mayhem'?'ARAM: Mayhem':b.mode==='aram'?'ARAM':'Summoner’s Rift')}</small></h2>
    ${mayhemChoiceView(b.mayhem)}
    ${readoutPanel(b)}${b.shop?liveShopPanel(b,true):'<p>Plan przygotowany. Złoto odczytam po rozpoczęciu meczu.</p>'}
    ${matchSkipsPanel(b,true)}
    ${alt?`<article class="compact-alternative"><b>Alternatywa: ${esc(alt.target.name)}</b><p>${esc(alt.benefit)}</p><p>Do ukończenia: ${alt.target.cost} złota${alt.purchase?' · teraz '+esc(alt.purchase.name)+' za '+alt.purchase.cost:''}</p><button data-pin-next="${alt.target.id}">Zbieram na ten przedmiot</button></article>`:''}
    ${tip?`<aside class="compact-tip"><b>Najważniejsze teraz</b><p>${esc(tip)}</p></aside>`:''}
    ${otherSkipChoices(b)}
    ${dataFreshnessBadge()} <button data-build-report>Zgłoś dziwny build</button><p class="compact-help">${s.compactShortcutLabel ? esc(s.compactShortcutLabel)+' chowa to okno. ' : ''}„Pełny widok” otwiera szczegóły.</p>${mayhemOfferDock(b.mayhem,true)}</section>`;
}
function setCompactView(value){
  compactMode=!!value;document.body.classList.toggle('compact-mode',compactMode);
  document.getElementById('view-toggle').textContent=compactMode?'Pełny widok':'Mały widok';
  if(compactMode){document.querySelectorAll('dialog[open]').forEach(d=>d.close());labActive=false;document.getElementById('draft-lab').textContent='Tester draftów';}
  if(typeof render==='function')render(lastState);
}
document.getElementById('view-toggle').onclick=()=>window.assist.setViewMode(!compactMode).catch(e=>toast(e.message,true));
window.assist.onViewMode?.(setCompactView);
if(window.assist.getViewMode)window.assist.getViewMode().then(setCompactView);
