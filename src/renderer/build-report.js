let openedBuildReport = null;

function reportLabSummary() {
  if (!openedBuildReport) return '';
  const r = openedBuildReport;
  return `<details class="lab-allies" open><summary>Oryginalny build · ${esc(r.scenario.alias)}</summary>
    <p>${r.observed.plan.map(i=>esc(i.name)).join(' → ')}${r.observed.questSlot ? ' · Slot questa: '+esc(r.observed.questSlot.name) : ''}</p>
    <p class="muted">Patch ${esc(r.patch || 'nieznany')} · ${esc(r.observed.source)}. Tester poniżej przelicza ten przypadek na obecnej bazie.</p>
    <button data-keep-open-report>Zachowaj oryginał do porównań wersji</button></details>`;
}

async function openReportInLab(report) {
  await enterDraftLab(report);
}

function previewBuildReport(draft,source='before') {
  const report = source==='current' && draft.currentReport ? draft.currentReport : draft.report;
  const skippedName = draft.items.find(i=>i.id===draft.suggestedExclusion)?.name;
  const options = draft.items.map(i=>`<option value="${i.id}">${esc(i.name)} (#${i.id})</option>`).join('');
  let dialog = document.getElementById('build-report-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog'); dialog.id = 'build-report-dialog'; document.body.appendChild(dialog);
  }
  dialog.innerHTML = `<div class="panel-head"><h2>Zgłoś dziwny build</h2><button data-close>Zamknij</button></div>
    <p><b>${esc(report.scenario.alias)}</b> · ${esc({classic:'Summoner’s Rift',aram:'ARAM',mayhem:'ARAM Mayhem',practice:'Practice Tool'}[report.scenario.mode])} · patch ${esc(report.patch || 'nieznany')}</p>
    ${draft.currentReport ? `<label>Plan do zgłoszenia <select data-report-source>
      <option value="before"${source==='before'?' selected':''}>Przed pominięciem · ${esc(skippedName)}</option>
      <option value="current"${source==='current'?' selected':''}>Obecny build</option></select></label>` : ''}
    <ol>${report.observed.plan.map(i=>`<li><b>${esc(i.name)}</b> · ${esc(i.reason)}</li>`).join('')}</ol>
    ${report.observed.questSlot ? `<p>Slot questa · ${esc(report.observed.questSlot.name)}</p>` : ''}
    <p>Plik zawiera skład z nazwami postaci, augmenty, przedmioty i powody zakupów. Zapisujesz go lokalnie i sam decydujesz, komu go przekazać.</p>
    <fieldset><legend>Co powinno się zmienić?</legend>
      <label>Warunek do sprawdzenia <select data-expect-kind>
        <option value="">Bez warunku</option><option value="include">W buildzie powinien być</option>
        <option value="exclude">Z buildu powinien wypaść</option><option value="after">Można kupić dopiero po innym przedmiocie</option>
      </select></label>
      <label hidden data-item-field>Przedmiot <select data-expect-item>${options}</select></label>
      <label hidden data-prior-field>Wcześniejszy zakup <select data-expect-prior>${options}</select></label>
      <p class="muted">Po zapisaniu zgłoszenia z warunkiem jego wynik znajdziesz w „Porównaj wersje”.</p>
    </fieldset>
    <details><summary>Cała zawartość zgłoszenia</summary><pre class="build-report-json"></pre></details>
    <div class="actions"><button data-save class="primary">Zapisz plik JSON</button><button data-replay>Otwórz w testerze</button></div>
    <p role="status"></p>`;
  const kind = dialog.querySelector('[data-expect-kind]'), item = dialog.querySelector('[data-expect-item]'), prior = dialog.querySelector('[data-expect-prior]');
  if (report.observed.plan.length) item.value = String(report.observed.plan[0].id);
  if (source==='before' && draft.suggestedExclusion) { kind.value='exclude'; item.value=String(draft.suggestedExclusion); }
  const reportSource=dialog.querySelector('[data-report-source]');
  if (reportSource) reportSource.onchange=()=>previewBuildReport(draft,reportSource.value);
  const currentReport = () => kind.value ? {...report,expectation:{kind:kind.value,itemId:Number(item.value),
    ...(kind.value === 'after' ? {prerequisiteId:Number(prior.value)} : {})}} : report;
  const update = () => {
    dialog.querySelector('[data-item-field]').hidden = !kind.value;
    dialog.querySelector('[data-prior-field]').hidden = kind.value !== 'after';
    for (const option of prior.options) option.disabled = option.value === item.value;
    if (prior.selectedOptions[0]?.disabled) prior.value = [...prior.options].find(o=>!o.disabled)?.value || '';
    dialog.querySelector('pre').textContent = JSON.stringify(currentReport(),null,2);
    dialog.querySelector('[role=status]').textContent = '';
  };
  for (const field of [kind,item,prior]) field.onchange = update;
  update();
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-save]').onclick = async e => {
    const button=e.currentTarget; button.disabled=true;
    try {
      const res = await window.assist.saveBuildReport(draft.token,currentReport().expectation,source);
      if (!res.ok) throw Error(res.error);
      dialog.querySelector('[role=status]').textContent = res.saved ? 'Zapisano plik. Możesz go otworzyć z Testera draftów.' : '';
    } catch (err) { dialog.querySelector('[role=status]').textContent = err.message; }
    finally { button.disabled=false; }
  };
  dialog.querySelector('[data-replay]').onclick = async () => {
    try { dialog.close(); await openReportInLab(currentReport()); } catch (err) { toast(err.message,true); }
  };
  if (!dialog.open) dialog.showModal();
}

document.addEventListener('click', async e => {
  if (openedBuildReport && e.target.closest('[data-keep-open-report]')) {
    try {
      const result=await window.assist.manageReplay({action:'import',text:JSON.stringify(openedBuildReport)});
      if (!result.ok) throw Error(result.error);
      toast('Oryginalny przypadek jest w „Porównaj wersje”.');
    } catch (err) { toast(err.message,true); }
  }
  if (e.target.closest('[data-build-report]')) {
    const b = currentBuild();
    if (!b) return;
    try {
      const draft = await window.assist.captureBuildReport(b.reportToken);
      if (!draft.ok) throw Error(draft.error);
      previewBuildReport(draft);
    } catch (err) { toast(err.message,true); }
  }
  if (e.target.closest('[data-open-build-report]')) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      try {
        const file = input.files[0]; if (!file) return;
        if (file.size > 128*1024) throw Error('Zgłoszenie jest za duże.');
        const res = await window.assist.readBuildReport(await file.text());
        if (!res.ok) throw Error(res.error);
        await openReportInLab(res.report);
      } catch (err) { toast(err.message,true); }
    };
    input.click();
  }
});
