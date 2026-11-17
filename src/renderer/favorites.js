function favoriteSearchText(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'')
    .replace(/ł/g,'l').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
function favoriteKeywords(entry) {
  return favoriteSearchText([entry.name,entry.alias,entry.english,entry.headliner?.name,entry.note,
    ...entry.augments.flatMap(a => [a.name,a.english]),
    ...entry.items.flatMap(i => [i.name,i.english,i.polish])].join(' '));
}

async function openMayhemFavorites(selectedId) {
  const response = await window.assist.mayhemFavorites();
  if (!response.ok) throw Error(response.error);
  let dialog = document.getElementById('favorites-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog'); dialog.id = 'favorites-dialog';
    dialog.setAttribute('aria-labelledby','favorites-heading'); document.body.appendChild(dialog);
  }
  const entries = new Map(response.entries.map(e => [e.id,e]));
  dialog.innerHTML = `<div class="panel-head"><h2 id="favorites-heading">Ulubione kombinacje Mayhem</h2><button data-close-favorites>Zamknij</button></div>
    <label class="favorite-search">Szukaj postaci, augmentu, przedmiotu lub notatki<input type="search" placeholder="Np. Zed lub Stormsurge"></label>
    <div class="favorite-list">${response.entries.map(entry => `<details class="favorite" data-favorite-id="${esc(entry.id)}"${entry.id===selectedId?' open':''}>
      <summary><strong>${esc(entry.name)}</strong><span>${entry.augments.map(a=>esc(a.name)).join(' · ') || 'Brak zapisanych augmentów'}</span></summary>
      ${entry.headliner ? `<p><b>Headliner</b> · ${esc(entry.headliner.name)} ${esc(entry.headliner.ability)}</p>` : ''}
      <p><b>Ostatni ekwipunek</b> · ${entry.items.map(i => `${i.count>1?i.count+' × ':''}${esc(i.name)}`).join(', ') || 'Brak odczytanych przedmiotów'}</p>
      ${entry.incomplete ? '<p class="note">Zapis meczu był niepełny.</p>' : ''}
      <form class="favorite-note"><label>Twoja notatka<textarea maxlength="400" rows="2">${esc(entry.note)}</textarea></label>
        <div class="actions"><button type="submit">Zapisz notatkę</button><button type="button" data-remove-favorite>Usuń z ulubionych</button></div>
        <p role="status"></p></form></details>`).join('')}</div>
    <p class="muted favorite-empty" role="status"></p>`;
  const search = dialog.querySelector('input[type=search]');
  const filterRows = () => {
    const words = favoriteSearchText(search.value).split(' ').filter(Boolean);
    let visible = 0;
    for (const el of dialog.querySelectorAll('[data-favorite-id]')) {
      const text = favoriteKeywords(entries.get(el.dataset.favoriteId));
      el.hidden = !words.every(word=>text.includes(word));
      if (!el.hidden) visible++;
    }
    dialog.querySelector('.favorite-empty').textContent = visible ? '' : entries.size
      ? 'Brak kombinacji pasującej do wyszukiwania.' : 'Otwórz podsumowanie meczu Mayhem i wybierz „Dodaj do ulubionych”.';
  };
  search.oninput = filterRows;
  dialog.querySelector('[data-close-favorites]').onclick = () => dialog.close();
  dialog.onsubmit = async e => {
    e.preventDefault();
    const form = e.target;
    const id = form.closest('[data-favorite-id]').dataset.favoriteId;
    const field = form.querySelector('textarea'), note = field.value.trim(), button = form.querySelector('button[type=submit]');
    button.disabled=true;
    try {
      const result = await window.assist.editMayhemFavorite({id,note});
      if (!result.ok) throw Error(result.error);
      const entry = entries.get(id);
      if (entry) { entry.note=note; form.querySelector('[role=status]').textContent='Zapisano notatkę.'; filterRows(); }
    } catch (err) { form.querySelector('[role=status]').textContent=err.message; }
    finally { button.disabled=false; }
  };
  dialog.onclick = async e => {
    const button = e.target.closest('[data-remove-favorite]');
    if (!button) return;
    const card = button.closest('[data-favorite-id]'), id = card.dataset.favoriteId;
    button.disabled=true;
    try {
      const result = await window.assist.removeMayhemFavorite(id);
      if (!result.ok) throw Error(result.error);
      entries.delete(id); card.remove(); filterRows();
      const saved = document.querySelector('[data-save-favorite]');
      if (saved?.dataset.savedId === id) { delete saved.dataset.savedId; saved.textContent='Dodaj do ulubionych'; }
      search.focus();
    } catch (err) { card.querySelector('[role=status]').textContent=err.message; button.disabled=false; }
  };
  filterRows();
  if (!dialog.open) dialog.showModal();
  if (selectedId) dialog.querySelector('details[open] textarea')?.focus();
  else search.focus();
}

document.addEventListener('click', async e => {
  const button = e.target.closest('[data-open-favorites],[data-save-favorite]');
  if (!button) return;
  button.disabled = true;
  try {
    if (button.hasAttribute('data-open-favorites') || button.dataset.savedId) await openMayhemFavorites(button.dataset.savedId);
    else {
      const result = await window.assist.addMayhemFavorite(button.dataset.saveFavorite);
      if (!result.ok) throw Error(result.error);
      button.dataset.savedId=result.id; button.textContent='W ulubionych · edytuj notatkę';
      toast(result.added ? 'Zapisano ulubioną kombinację' : 'Ta kombinacja jest już w ulubionych');
    }
  } catch (err) { toast(err.message,true); }
  finally { button.disabled = false; }
});
