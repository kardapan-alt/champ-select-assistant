const trainingLabels = {cs10:'CS', vision10:'Wynik wizji'};
const trainingRoles = {top:'Top', jungle:'Jungle', middle:'Mid', bottom:'ADC', utility:'Support'};
const trainingNumber = n => n.toLocaleString('pl-PL', {maximumFractionDigits:2});

function trainingDraftPanel(view) {
  if (!view) return '';
  if (!view.ready) return '<section class="panel"><h3>Cel treningowy na ten mecz</h3><p class="note">Czekam na potwierdzenie meczu, konta i roli w kliencie.</p></section>';
  const metric = view.metric || (view.role === 'utility' ? 'vision10' : 'cs10');
  const target = view.target ?? (metric === 'vision10' ? 5 : 70);
  return `<section class="panel"><h3>Cel treningowy na ten mecz</h3>
    <form data-training-form data-game-id="${esc(view.gameId)}" data-role="${esc(view.role)}">
      <div class="actions"><label>Pomiar przy 10:00 <select data-training-metric name="metric">
        ${Object.entries(trainingLabels).map(([key,label])=>`<option value="${key}" ${metric===key?'selected':''}>${label}</option>`).join('')}
      </select></label>
      <label>Co najmniej <input data-training-target name="target" type="number" min="1" max="999" required value="${target}"></label>
      <button type="submit">${view.metric?'Zmień cel':'Zapisz cel'}</button>
      ${view.metric?'<button type="button" data-clear-training>Usuń cel</button>':''}</div>
      <p class="note" data-training-saved>${view.metric?'Zapisany cel · '+trainingLabels[view.metric]+' ≥ '+view.target+' · '+trainingRoles[view.role]:'Po meczu porównasz swój pomiar z poprzednimi grami solo/duo na tej roli.'}</p>
    </form></section>`;
}

function trainingResultPanel(match) {
  const t = match.training;
  if (!t?.goal) return '';
  const {metric, target} = t.goal, sample = t.samples?.[metric], base = t.baseline;
  const label = trainingLabels[metric], compare = base?.count
    ? `Twoja mediana · ${trainingNumber(base.median)}. Dostępne pomiary z poprzednich gier na tej roli · ${base.count} z maks. 20.`
    : 'Brak wcześniejszych pomiarów tego wskaźnika na tej roli.';
  return `<section class="training-result" data-training-result><h4>Cel treningowy · ${esc(trainingRoles[t.role])}</h4>
    <p>Cel przy 10:00 · ${esc(label)} ≥ ${esc(target)}</p>
    ${sample?`<p><b>${trainingNumber(sample.value)} · ${sample.value>=target?'Cel osiągnięty':'Poniżej celu'}</b> · odczyt przy ${reviewTime(sample.at)}</p>`:'<p>Brak pomiaru przy 10:00. Potrzebny jest odczyt z gry między 10:00 a 10:05.</p>'}
    <p class="note">${compare}</p></section>`;
}

document.getElementById('app').addEventListener('change', e => {
  if (e.target.matches('[data-training-metric]')) e.target.form.elements.target.value = e.target.value==='vision10' ? 5 : 70;
});
async function saveTrainingForm(form, clear) {
  const controls = form.querySelectorAll('button');
  controls.forEach(b=>b.disabled=true);
  try {
    const response = await window.assist.setTrainingGoal({gameId:form.dataset.gameId, role:form.dataset.role,
      metric:clear?null:form.elements.metric.value, target:form.elements.target.valueAsNumber});
    if (!response.ok) throw Error(response.error);
    toast(clear?'Usunięto cel na ten mecz.':'Zapisano cel na ten mecz.');
  } catch (error) { toast(error.message,true); }
  finally { controls.forEach(b=>b.disabled=false); }
}
document.getElementById('app').addEventListener('submit',e=>{
  if (!e.target.matches('[data-training-form]')) return;
  e.preventDefault();
  saveTrainingForm(e.target,false);
});
document.getElementById('app').addEventListener('click',e=>{
  const clear=e.target.closest('[data-clear-training]');
  if (clear) saveTrainingForm(clear.form,true);
});
