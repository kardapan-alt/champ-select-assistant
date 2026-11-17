function matchupNoteLabel(context) {
  const roles = {top:'Top',jungle:'Jungle',middle:'Mid',bottom:'ADC',utility:'Support'};
  return roles[context.role]+' · '+context.own+(context.kind==='duo'?' + ':' przeciw ')+context.other+
    (context.kind==='duo'?'':' ('+roles[context.otherRole]+')');
}

function matchupRemindersPanel(notes) {
  if (!notes?.length) return '';
  return `<section class="panel" data-matchup-reminders><h3>Twoje notatki na ten mecz</h3>
    ${notes.map(n=>`<p><b>${esc(matchupNoteLabel(n.context))}</b><br><span class="matchup-note-body">${esc(n.text)}</span></p>`).join('')}</section>`;
}

async function openMatchupNotes(matchKey, bookmark=null) {
  const previous=document.getElementById('matchup-notes-dialog');
  if (previous?.open) return;
  previous?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'matchup-notes-dialog';
  dialog.setAttribute('aria-labelledby','matchup-notes-title');
  dialog.innerHTML = `<div class="panel-head"><h2 id="matchup-notes-title">Notes matchupów SoloQ</h2><button data-close-notes>Zamknij</button></div>
    <form hidden><label>Matchup lub duet<select data-note-context></select></label>
      <label>Twoja notatka<textarea data-note-text rows="3" maxlength="500" required></textarea></label>
      <div class="actions"><button data-note-save>Zapisz</button><button type="button" data-note-remove>Usuń notatkę</button></div></form>
    <p role="status" aria-live="polite"></p>`;
  document.body.appendChild(dialog);
  dialog.querySelector('[data-close-notes]').onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  dialog.showModal();
  const feedback = dialog.querySelector('[role=status]'), form = dialog.querySelector('form');
  const selector = dialog.querySelector('[data-note-context]'), field = dialog.querySelector('[data-note-text]');
  const remove = dialog.querySelector('[data-note-remove]');
  let view;
  function showOption() {
    const item = view.options.find(o => o.context.id===selector.value);
    const original=item?.text || '';
    field.value = bookmark ? [original,bookmark.time+' · '+bookmark.text].filter(Boolean).join('\n') : original;
    remove.hidden = !!bookmark || !item?.text;
    feedback.textContent = item?.updatedAt ? 'Ostatni zapis · '+new Date(item.updatedAt).toLocaleDateString('pl-PL') : '';
  }
  function render(id) {
    form.hidden = !view.options.length;
    selector.replaceChildren();
    for (const inMatch of [true,false]) {
      const group = document.createElement('optgroup');
      group.label = inMatch?'Z wybranego meczu':'Pozostałe zapisane notatki';
      for (const {context,fromMatch} of view.options) {
        if (fromMatch===inMatch) group.append(new Option(matchupNoteLabel(context),context.id));
      }
      if (group.children.length) selector.append(group);
    }
    if (view.options.some(o => o.context.id===id)) selector.value=id;
    showOption();
    if (!view.options.length) feedback.textContent = 'Aby dodać pierwszą notatkę, wybierz zapisany mecz Solo/Duo z potwierdzoną pozycją rywala lub partnera na bocie.';
  }
  async function change(action) {
    form.inert = true;
    const id = selector.value;
    try {
      const result = await window.assist.editMatchupNote({owner:view.owner, match:matchKey, id, action, text:field.value});
      if (!result.ok) throw Error(result.error);
      if (!dialog.open) return;
      view=result;
      if (bookmark) {
        dialog.close();
        toast('Dodano zakładkę do notesu matchupu.');
        return;
      }
      render(id);
      feedback.textContent = action==='save'?'Zapisano notatkę.':'Usunięto notatkę.';
    } catch (e) { feedback.textContent=e.message; }
    finally { form.inert=false; }
  }
  selector.onchange=showOption;
  form.onsubmit=e=>{e.preventDefault();change('save');};
  remove.onclick=()=>change('remove');
  try {
    view=await window.assist.matchupNotes(matchKey);
    if (!view.ok) throw Error(view.error);
    if (bookmark) view.options=view.options.filter(o=>o.fromMatch);
    if (dialog.open) render();
  } catch (e) { feedback.textContent=e.message; }
}
