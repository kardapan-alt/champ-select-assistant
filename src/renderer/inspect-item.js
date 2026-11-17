const itemShortNames = {ie:3031,ldr:3036,bork:3153,botrk:3153,rfc:3094,zhonya:3157,omen:3143};
const itemSearchText = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');

function inspectionResult(info) {
  const status = info.selected ? info.side ? 'W slocie questa' : `W planie · zakup ${info.slot}`
    : info.considered ? 'Rozważany w tym drafcie' : 'Poza rankingiem';
  const chain = list=>list.map(i=>{
    const label=esc(i.name)+(i.side?' (slot questa)':'');
    return i.id===info.id ? `<strong>${label}</strong>` : label;
  }).join(' → ');
  const trial = info.trial;
  return `<h3>${esc(info.name)}</h3><p class="tag">${esc(status)}</p><p>${esc(info.reason)}</p>
    ${info.reasons.map(msg=>`<p class="muted">${esc(msg)}</p>`).join('')}
    ${trial ? trial.blocked ? `<p class="note">${esc(trial.blocked)}</p>` : `<h4>Symulacja dodania do buildu</h4>
      <p>${trial.side ? 'Boczny slot butów' : `Miejsce w kolejności zakupów: ${trial.slot}`}${trial.replaced ? ` · w pierwotnym planie: ${esc(trial.replaced)}` : ''}</p>
      <p><b>Obecnie</b> · ${chain(trial.before)}</p>
      <p><b>Po dodaniu</b> · ${chain(trial.after)}</p>` : ''}`;
}

document.addEventListener('click', async e => {
  if (!e.target.closest('[data-inspect-item]') || !labActive) return;
  const dialog = document.getElementById('inspect-item-dialog');
  if (!labView || !dialog) { toast('Najpierw wybierz poprawny draft.',true); return; }
  const revision=labRevision;
  try {
    const catalog = await window.assist.inspectionItems();
    if (!labActive || revision!==labRevision || !dialog.isConnected) return;
    if (!catalog.ok) throw Error(catalog.error);
    dialog.innerHTML=`<div class="panel-head"><h2>Dlaczego nie ten przedmiot?</h2><button data-close>Zamknij</button></div>
      <form><label>Szukaj przedmiotu<input type="search" placeholder="np. IE, Trinity Force, Ostrze Nieskończoności" autocomplete="off"></label>
      <label>Wyniki<select size="5" name="item"></select></label><div class="actions"><button type="submit" class="primary">Sprawdź w tym drafcie</button></div></form>
      <section aria-live="polite" data-item-explanation></section>`;
    const search=dialog.querySelector('input'), list=dialog.querySelector('select'), result=dialog.querySelector('[data-item-explanation]');
    let request=0;
    const filter=()=>{
      request++; result.textContent='';
      const term=itemSearchText(search.value.trim());
      const shortcut=Object.hasOwn(itemShortNames,term) ? itemShortNames[term] : null;
      const entries=catalog.items.filter(item=>shortcut ? item.id===shortcut : String(item.id)===term ||
        [item.name,item.english,item.polish].some(s=>itemSearchText(s).includes(term)));
      // Lower shop IDs win ties between the regular item and mode-specific copies.
      const exact = i => !!term && [i.name,i.english,i.polish].some(s=>itemSearchText(s)===term);
      entries.sort((a,b)=>Number(exact(b))-Number(exact(a)) || a.name.localeCompare(b.name) || a.id-b.id);
      list.innerHTML=entries.slice(0,70).map(i=>`<option value="${i.id}">${esc(i.name)} · #${i.id}</option>`).join('');
      list.selectedIndex=entries.length ? 0 : -1;
      dialog.querySelector('[type=submit]').disabled=!entries.length;
      if (!entries.length) result.textContent='Brak wyników w katalogu gry.';
    };
    search.oninput=filter;
    list.onchange=()=>{request++;result.textContent='';};
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=async ev=>{
      ev.preventDefault();
      const current=++request,id=Number(list.value);
      if (labRevision!==revision || !labActive) { dialog.close(); return; }
      result.textContent='Przeliczam build…';
      try {
        const res=await window.assist.inspectDraftItem(labInput,id);
        if (request!==current || !dialog.open || !labActive || labRevision!==revision) return;
        if (!res.ok) throw Error(res.error);
        result.innerHTML=inspectionResult(res.inspection);
      } catch (err) { if (current===request) result.textContent=err.message; }
    };
    filter(); dialog.showModal(); search.focus();
  } catch (err) { toast(err.message,true); }
});
