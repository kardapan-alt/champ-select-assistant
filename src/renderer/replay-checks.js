function replayCheckCard(c) {
  const mode={classic:'SR',aram:'ARAM',mayhem:'Mayhem'}[c.mode] || '';
  const when = c.date ? new Date(c.date).toLocaleDateString('pl-PL')+' · '+reviewTime(c.time) : 'Zapisany raport';
  const label = {changed:'Zmiana',same:'Ta sama kolejność',unavailable:'Brak porównania'}[c.status];
  const order = list => list.map(item=>esc(item.name)).join(' → ');
  const changes = (c.changes || []).map(item=>{
    const movement = item.from == null ? `dodany na miejsce ${item.to}` : item.to == null ? `wypadł z miejsca ${item.from}` : `miejsce ${item.from} → ${item.to}`;
    const replacement = item.to == null && c.after[item.from-1];
    return `<li><b>${esc(item.name)}</b> · ${movement}
      ${item.reason ? `<p>${esc(item.reason)}</p>` : ''}
      ${item.to==null && item.previousReason ? `<p>W pierwotnym planie · ${esc(item.previousReason)}</p>` : ''}
      ${replacement ? `<p>Teraz na tym miejscu: ${esc(replacement.name)} · ${esc(replacement.reason)}</p>` : ''}
      </li>`;
  }).join('');
  return `<details class="replay-case" data-case="${esc(c.id)}" data-report-id="${esc(c.caseId)}">
    <summary><strong>${esc(c.name)}</strong> · ${esc(mode)} · ${esc(when)} · ${esc(label)}${c.expectation ? (c.expectation.passed?' · Warunek spełniony':' · Warunek niespełniony'):''}</summary>
    ${c.expectation ? '<p>'+esc(c.expectation.message)+'</p>' : ''}
    <p class="muted">Zapis z wersji ${esc(c.originalVersion || 'nieznanej')} · patch ${esc(c.patch || 'nieznany')} · ${esc(c.source)}</p>
    ${c.error ? `<p class="note">${esc(c.error)}</p>` : `<p><b>W meczu</b> · ${order(c.before)}</p><p><b>Obecna wersja</b> · ${order(c.after)}</p>
    ${changes ? `<ul>${changes}</ul>` : ''}${c.quest ? `<p>Slot questa · ${esc(c.quest.before || 'pusty')} → ${esc(c.quest.after || 'pusty')}</p>` : ''}`}
    <div class="actions">${c.status!=='unavailable'?'<button data-replay-action="open">Otwórz w testerze</button>':''}
    <button data-replay-action="${c.saved?'remove':'keep'}">${c.saved?'Usuń z zachowanych':'Zachowaj po wygaśnięciu historii'}</button></div></details>`;
}

async function openReplayChecks(focusId) {
  const res=await window.assist.checkSavedMatches();
  if (!res.ok) throw Error(res.error);
  let dialog=document.getElementById('replay-checks');
  if (!dialog) { dialog=document.createElement('dialog'); dialog.id='replay-checks'; document.body.appendChild(dialog); }
  const changed=res.checks.filter(c=>c.status==='changed').length;
  const same=res.checks.filter(c=>c.status==='same').length;
  const rank={changed:0,unavailable:1,same:2};
  dialog.innerHTML=`<div class="panel-head"><h2>Porównaj wersje</h2><button data-close-checks>Zamknij</button></div>
    <p>Wersja ${esc(res.version)} · ${res.patch?'katalog z klienta '+esc(res.patch):'katalog z niepotwierdzonym patchem'}. Tester przelicza zapisany skład, augmenty, zakupy i przypięcia na obecnej bazie. Różnicę może też powodować zmiana patcha lub źródła danych.</p>
    <div class="actions"><button data-import-check>Dodaj raport JSON</button></div>
    <p role="status">${res.checks.length?`Zmiany: ${changed} · Ta sama kolejność: ${same} · Brak porównania: ${res.checks.length-changed-same}`:'Nowe mecze trafią tu automatycznie. Możesz też otworzyć zapisany plik „Zgłoś dziwny build”.'}</p>
    ${res.checks.sort((a,b)=>rank[a.status]-rank[b.status]).map(replayCheckCard).join('')}
    ${res.missing.length?`<details class="replay-case"><summary>Historia bez zapisanej sytuacji · ${res.missing.length}</summary>
    <p>Te mecze mają podsumowanie. Do przeliczenia potrzebny jest również skład i stan w chwili rekomendacji. Jeżeli masz z tego momentu raport JSON, dodaj go powyżej.</p>
    <ul>${res.missing.map(m=>`<li>${esc(m.name)} · ${esc(new Date(m.date).toLocaleDateString('pl-PL'))}</li>`).join('')}</ul></details>`:''}`;
  if (!dialog.open) dialog.showModal();
  if (focusId) {
    const row=[...dialog.querySelectorAll('[data-case]')].find(el=>el.dataset.case===focusId || el.dataset.reportId===focusId);
    if (row) { row.open=true; row.scrollIntoView({block:'nearest'}); }
  }
  dialog.querySelector('[data-close-checks]').onclick=()=>dialog.close();
  dialog.querySelector('[data-import-check]').onclick=()=>{
    const input=document.createElement('input'); input.type='file'; input.accept='.json,application/json';
    input.onchange=async()=>{
      const file=input.files[0]; if (!file) return;
      try {
        if (file.size>128*1024) throw Error('Zgłoszenie jest za duże.');
        const result=await window.assist.manageReplay({action:'import',text:await file.text()});
        if (!result.ok) throw Error(result.error);
        await openReplayChecks(result.id);
      } catch (err) { dialog.querySelector('[role=status]').textContent=err.message; }
    };
    input.click();
  };
  dialog.onclick=async e=>{
    const button=e.target.closest('[data-replay-action]'); if (!button) return;
    const action=button.dataset.replayAction,id=button.closest('[data-case]').dataset.case;
    button.disabled=true;
    try {
      const result=await window.assist.manageReplay({action,id}); if (!result.ok) throw Error(result.error);
      if (action==='open') {
        dialog.close(); document.getElementById('review-dialog')?.close(); await openReportInLab(result.report);
      } else await openReplayChecks(id);
    } catch (err) { dialog.querySelector('[role=status]').textContent=err.message; }
    finally { button.disabled=false; }
  };
}
document.addEventListener('click',e=>{
  if (e.target.closest('[data-compare-versions]')) openReplayChecks().catch(err=>toast(err.message,true));
});
