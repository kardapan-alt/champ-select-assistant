let openedBuildReport = null;

function reportLabSummary() {
  if (!openedBuildReport) return '';
  const r = openedBuildReport;
  return `<details class="lab-allies" open><summary>Oryginalny build · ${esc(r.scenario.alias)}</summary>
    <p>${r.observed.plan.map(i=>esc(i.name)).join(' → ')}${r.observed.questSlot ? ' · Slot questa: '+esc(r.observed.questSlot.name) : ''}</p>
    <p class="muted">Patch ${esc(r.patch || 'nieznany')} · ${esc(r.observed.source)}. Tester poniżej przelicza ten przypadek na obecnej bazie.</p></details>`;
}

async function openReportInLab(report) {
  await enterDraftLab(report);
}

function previewBuildReport(draft) {
  const { report } = draft;
  let dialog = document.getElementById('build-report-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog'); dialog.id = 'build-report-dialog'; document.body.appendChild(dialog);
  }
  dialog.innerHTML = `<div class="panel-head"><h2>Zgłoś dziwny build</h2><button data-close>Zamknij</button></div>
    <p><b>${esc(report.scenario.alias)}</b> · ${esc({classic:'Summoner’s Rift',aram:'ARAM',mayhem:'ARAM Mayhem'}[report.scenario.mode])} · patch ${esc(report.patch || 'nieznany')}</p>
    <ol>${report.observed.plan.map(i=>`<li><b>${esc(i.name)}</b> · ${esc(i.reason)}</li>`).join('')}</ol>
    ${report.observed.questSlot ? `<p>Slot questa · ${esc(report.observed.questSlot.name)}</p>` : ''}
    <p>Plik zawiera skład z nazwami postaci, augmenty, przedmioty i powody zakupów. Zapisujesz go lokalnie i sam decydujesz, komu go przekazać.</p>
    <details><summary>Cała zawartość zgłoszenia</summary><pre class="build-report-json"></pre></details>
    <div class="actions"><button data-save class="primary">Zapisz plik JSON</button><button data-replay>Otwórz w testerze</button></div>
    <p role="status"></p>`;
  dialog.querySelector('pre').textContent = JSON.stringify(report,null,2);
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-save]').onclick = async e => {
    const button=e.currentTarget; button.disabled=true;
    try {
      const res = await window.assist.saveBuildReport(draft.token);
      if (!res.ok) throw Error(res.error);
      dialog.querySelector('[role=status]').textContent = res.saved ? 'Zapisano plik. Możesz go otworzyć z Testera draftów.' : '';
    } catch (err) { dialog.querySelector('[role=status]').textContent = err.message; }
    finally { button.disabled=false; }
  };
  dialog.querySelector('[data-replay]').onclick = async () => {
    try { dialog.close(); await openReportInLab(report); } catch (err) { toast(err.message,true); }
  };
  if (!dialog.open) dialog.showModal();
}

document.addEventListener('click', async e => {
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
