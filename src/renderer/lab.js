let labActive = false, labView = null, labCatalog = null, labRevision = 0, labEntry = 0;
let labInput = { alias: 'Leona', role: 'utility', mode: 'classic', allies: ['', '', '', ''], enemies: ['Yasuo', 'Jhin', 'Ahri', 'LeeSin', 'Lulu'], choices: {} };
let editorContext = null;
const roleNames = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot / ADC', utility: 'Support' };
const currentBuild = () => labActive ? labView?.build : lastState?.build || lastState?.final?.build;

function buildExplanation(b) {
  const sources = { pinned: 'Twój wybór', owned:'Już posiadasz', augment:'Augment Mayhem', rule: 'Reguła draftu', stats: 'Popularność OP.GG', core: 'Baza championa' };
  return `<section class="decision-list"><h4>Dlaczego ten przedmiot i dlaczego teraz?</h4>
    ${(b.decisions || []).map(d => `<div class="decision"><b>${d.step}. ${esc(d.name)}</b><span class="tag">${esc(sources[d.source] || 'Dopasowanie')}</span><p>${esc(d.text)}</p></div>`).join('')}
    ${(b.changes || []).map(t => `<p class="note">${esc(t)}</p>`).join('')}
    ${(b.choiceWarnings || []).map(t => `<p class="note bad">${esc(t)}</p>`).join('')}
    <button data-edit-items>Własne przedmioty i przypięcia</button>
    <p class="note">Przypięty przedmiot zachowuje miejsce. Pozostałe zakupy nadal dopasowują się do draftu.</p></section>`;
}

async function applyOwnChoice(action) {
  const b = currentBuild();
  if (!b) return;
  if (!labActive) {
    const res = await window.assist.editChoices({ ...action, alias: b.alias, scope: editorContext?.scope || b.scope });
    if (!res.ok) throw new Error(res.error);
    return;
  }
  const own = JSON.parse(JSON.stringify(labView.choices || { items: [], boots: null, runes: null }));
  if (action.action === 'item') {
    if (action.slot === 'boots') own.boots = own.boots === Number(action.id) ? null : Number(action.id);
    else {
      const slot = Number(action.slot), id = Number(action.id), same = own.items.some(p => p.slot === slot && p.id === id);
      own.items = own.items.filter(p => p.slot !== slot);
      if (!same) own.items.push({ slot, id });
    }
  } else if (action.action === 'items') { own.items = action.items; own.boots = action.boots; }
  else if (action.action === 'reset-items') { own.items = []; own.boots = null; }
  else if (action.action === 'runes') {
    const p = labView.myChampion.runes;
    own.runes = { primaryStyleId: p.primaryStyleId, subStyleId: p.subStyleId, selectedPerkIds: p.selectedPerkIds };
  } else if (action.action === 'unpin-runes') own.runes = null;
  const revision = ++labRevision;
  const res = await window.assist.previewDraft({ ...labInput, choices: own });
  if (!labActive || revision !== labRevision) throw new Error('Draft się zmienił. Wybierz przypięcie ponownie.');
  if (!res.ok) throw new Error(res.error);
  labInput.choices = own; labView = res; renderLabResults();
}

async function openItemEditor() {
  const b = currentBuild();
  if (!b) return;
  const wasLab = labActive;
  const context = labActive ? { ok: true, choices: labView.choices, catalog: labView.catalog } : await window.assist.getChoices(b.alias);
  if (!context.ok) throw new Error(context.error);
  if (wasLab !== labActive || currentBuild()?.alias !== b.alias || currentBuild()?.scope !== b.scope) throw new Error('Draft się zmienił. Otwórz wybory ponownie.');
  editorContext = { ...context, alias: b.alias, lab: labActive };
  let dialog = document.getElementById('choices-dialog');
  if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'choices-dialog'; document.body.appendChild(dialog); }
  const options = (list, id, automatic) => `<option value="0">Automatycznie${automatic ? ` · ${esc(automatic)}` : ''}</option>${list.map(it => `<option value="${it.id}" ${it.id === id ? 'selected' : ''}>${esc(it.name)} [${it.id}]</option>`).join('')}`;
  dialog.innerHTML = `<form id="choices-form"><h2>Własne wybory · ${esc(b.name)}</h2>
    <p class="muted">${labActive ? 'Przypięcia dotyczą tylko tego testowego draftu.' : 'Zapamiętane dla tej postaci, roli i trybu. „Automatycznie” oddaje dany slot asystentowi.'}</p>
    <div class="choice-grid">${Array.from({ length: b.inventory.itemSlots }, (_, slot) => `<label>Przedmiot ${slot + 1} · bez butów<select name="slot-${slot}">${options(context.catalog.items, context.choices.items?.find(p => p.slot === slot)?.id, b.items[slot]?.name)}</select></label>`).join('')}
    <label>Buty<select name="boots">${options(context.catalog.boots, context.choices.boots, b.boots.name)}</select></label></div>
    <p class="form-error" role="alert"></p><div class="actions"><button class="primary" type="submit">Zapisz przypięcia</button><button type="button" data-clear-items>Przywróć automatyczne</button><button type="button" data-close-editor>Anuluj</button></div></form>`;
  dialog.querySelector('[data-close-editor]').onclick = () => { dialog.close(); editorContext = null; };
  dialog.querySelector('[data-clear-items]').onclick = async () => {
    try { await applyOwnChoice({ action: 'reset-items' }); dialog.close(); editorContext = null; toast('Przywrócono automatyczny dobór przedmiotów'); }
    catch (err) { dialog.querySelector('.form-error').textContent = err.message; }
  };
  dialog.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    if (editorContext.lab !== labActive || currentBuild()?.alias !== editorContext.alias) { dialog.querySelector('.form-error').textContent = 'Draft się zmienił. Otwórz wybory ponownie.'; return; }
    const values = new FormData(e.target);
    const items = [...values].filter(([k,v]) => k.startsWith('slot-') && Number(v)).map(([k,v]) => ({ slot: Number(k.slice(5)), id: Number(v) }));
    const submit = e.target.querySelector('[type=submit]'); submit.disabled = true;
    try { await applyOwnChoice({ action: 'items', items, boots: Number(values.get('boots')) || null }); dialog.close(); editorContext = null; toast('Zapisano własne wybory'); }
    catch (err) { dialog.querySelector('.form-error').textContent = err.message; }
    finally { submit.disabled = false; }
  };
  dialog.showModal();
}

function labControls() {
  const champions = (value, blank) => `${blank ? '<option value="">Nieznany / pusty</option>' : ''}${labCatalog.champions.map(c => `<option value="${esc(c.alias)}" ${c.alias === value ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}`;
  return `<section class="panel lab-controls"><div class="panel-head"><h2>Tester draftów</h2><span class="tag">Symulacja</span></div>
    <p class="muted">Sprawdź build i runy przed grą. Przypięcia z symulacji obowiązują w tym podglądzie.</p>
    <div class="actions"><button data-inspect-item>Dlaczego nie ten przedmiot?</button><button data-open-build-report>Otwórz zgłoszenie buildu</button><button data-compare-versions>Porównaj wersje</button><button data-test-offer-screenshot>Test kart ze zrzutu</button><button data-pool-edit>Moja pula SoloQ</button></div>
    ${reportLabSummary()}
    <div class="lab-main"><label>Twój champion<select data-lab-field="alias">${champions(labInput.alias)}</select></label><label>Rola<select data-lab-field="role">${labInput.role === '' ? '<option value="" selected>Rola nieznana</option>' : ''}${Object.entries(roleNames).map(([v,n]) => `<option value="${v}" ${labInput.role === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Tryb<select data-lab-field="mode"><option value="classic" ${labInput.mode === 'classic' ? 'selected' : ''}>Summoner's Rift · questy</option><option value="aram" ${labInput.mode === 'aram' ? 'selected' : ''}>ARAM</option><option value="mayhem" ${labInput.mode === 'mayhem' ? 'selected' : ''}>ARAM: Mayhem · augmenty</option><option value="practice" ${labInput.mode === 'practice' ? 'selected' : ''}>Practice Tool</option></select></label></div>
    <details class="lab-allies"><summary>Sojusznicy · 4 opcjonalne miejsca</summary><div class="lab-team">${Array.from({length:4},(_,i) => `<label>Sojusznik ${i+1}<select data-lab-team="allies" data-index="${i}">${champions(labInput.allies[i],true)}</select></label>`).join('')}</div></details>
    <h4>Przeciwnicy</h4><div class="lab-team">${Array.from({length:5},(_,i) => `<label>${Object.values(roleNames)[i]}<select data-lab-team="enemies" data-index="${i}">${champions(labInput.enemies[i],true)}</select></label>`).join('')}</div>
    <div class="actions lab-presets"><span class="muted">Przykłady:</span><button data-lab-preset="crit">Dwa źródła krytów</button><button data-lab-preset="autos">Dużo autoataków</button><button data-lab-preset="tanks">Tanki + leczenie</button></div>
    <p id="lab-error" class="form-error" role="alert"></p></section><dialog id="inspect-item-dialog"></dialog><div id="lab-results"></div>`;
}
function renderLabResults() {
  if (!labActive || !labView || !document.getElementById('lab-results')) return;
  patch(document.getElementById('lab-results'), `${buildPanel(labView.build, true)}${priorityAdvicePanel(labView)}${disclosure('lab-runes', labView.build.mode === 'mayhem' ? 'Czary przywoływacza' : 'Runy i ich dopasowanie', myChampionPanel(labView.myChampion, true))}${compPanel(labView.compositions)}`);
}
async function evaluateLab() {
  const revision = ++labRevision;
  const res = await window.assist.previewDraft(labInput);
  if (!labActive || revision !== labRevision) return;
  document.getElementById('lab-error').textContent = res.ok ? '' : res.error;
  if (!res.ok) { document.getElementById('lab-results').innerHTML = ''; labView = null; return; }
  labView = res; renderLabResults();
}
document.getElementById('draft-lab').addEventListener('click', async () => {
  const dialog = document.getElementById('choices-dialog'); dialog?.close(); editorContext = null;
  document.getElementById('mayhem-dialog')?.close();
  if (labActive) { labActive = false; labRevision++; labEntry++; document.getElementById('draft-lab').textContent = 'Tester draftów'; render(lastState); return; }
  try { await enterDraftLab(); } catch (err) { toast(err.message, true); }
});
async function enterDraftLab(report = null) {
    const entry = ++labEntry;
    if (compactMode) await window.assist.setViewMode(false);
    const catalog = await window.assist.draftCatalog();
    if (entry !== labEntry) return;
    if (!catalog.ok) throw new Error(catalog.error);
    labCatalog = catalog;
    if (report) { openedBuildReport = report; labInput = structuredClone(report.scenario); }
    labActive = true; document.getElementById('draft-lab').textContent = 'Wróć do asystenta';
    $status.textContent = 'Testowy draft'; $status.className = 'status';
    patch($app, labControls()); await evaluateLab();
}
document.getElementById('app').addEventListener('change', async (e) => {
  const t = e.target;
  if (!labActive || (!t.dataset.labField && !t.dataset.labTeam)) return;
  if (labInput.context && (t.dataset.labField === 'alias' || t.dataset.labField === 'mode')) {
    delete labInput.context; openedBuildReport = null;
    if (!labInput.role) labInput.role = 'middle';
  }
  if (labInput.context && t.dataset.labTeam === 'enemies') labInput.context.enemies = null;
  if (t.dataset.labField) { labInput[t.dataset.labField] = t.value; labInput.choices = {}; labInput.mayhem = {}; }
  if (t.dataset.labTeam) labInput[t.dataset.labTeam][Number(t.dataset.index)] = t.value;
  patch($app,labControls());
  await evaluateLab();
});
document.getElementById('app').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn || !('editItems' in btn.dataset || 'choice' in btn.dataset || 'pinItem' in btn.dataset || 'labPreset' in btn.dataset)) return;
  e.stopImmediatePropagation(); btn.disabled = true;
  try {
    if ('editItems' in btn.dataset) await openItemEditor();
    else if ('pinItem' in btn.dataset) { await applyOwnChoice({ action: 'item', slot: btn.dataset.slot, id: Number(btn.dataset.pinItem) }); toast('Zmieniono przypięcie przedmiotu'); }
    else if ('choice' in btn.dataset) { await applyOwnChoice({ action: btn.dataset.choice }); toast(btn.dataset.choice === 'unpin-runes' ? 'Runy znów dopasowują się automatycznie' : 'Zachowano własną stronę run'); }
    else {
      const presets = {
        crit: { alias:'Ornn',role:'top',enemies:['Yasuo','LeeSin','Ahri','Jhin','Lulu'] },
        autos: { alias:'Ornn',role:'top',enemies:['Jax','MasterYi','Ahri','Vayne','Lulu'] },
        tanks: { alias:'Jinx',role:'bottom',enemies:['Ornn','Amumu','Malphite','Jhin','Soraka'] },
      };
      labInput = { ...labInput, ...presets[btn.dataset.labPreset], allies:['','','',''], choices:{}, mayhem:{} };
      delete labInput.context; openedBuildReport = null;
      patch($app, labControls()); await evaluateLab();
    }
  } catch (err) { toast(err.message, true); }
  finally { btn.disabled = false; }
});
