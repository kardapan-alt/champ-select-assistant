function poolBanResults(pool) {
  const { bans, cards } = pool;
  if (bans.blocked) return `<p class="note">Zmień niedostępny pick w porównaniu · ${esc(bans.blocked.join(', '))}.</p>`;
  const verdict = { bad:'trudny', good:'korzystny', even:'wyrównany', unknown:'brak danych' };
  const matchup = (p, i) => {
    const source = p.games ? ` · ${p.winRate.toLocaleString('pl', { maximumFractionDigits:1 })}% wygranych · ${p.games} gier · OP.GG` :
      p.source ? ' · ' + p.source : p.conflict ? ' · sprzeczne wpisy w profilu' : '';
    return `<span>${esc(cards[i].name)} · ${verdict[p.result]}${esc(source)}</span>`;
  };
  const row = r => `<div class="pool-ban-row" data-pool-foe="${esc(r.alias)}"><strong>${esc(r.name)}</strong><div>${r.pairs.map(matchup).join('')}</div></div>`;
  const more = (rows, key, title) => rows.length ? disclosure('pool-bans-' + key, `${title} (${rows.length})`, rows.map(row).join('')) : '';
  const missing = cards.filter((c,i) => !bans.counts[i]).map(c => c.name);
  return `<div class="pool-ban-results" data-pool-bans>
    ${bans.common.length ? `<h4>Trudni dla obu picków</h4>${bans.common.slice(0, 2).map(row).join('')}` :
        '<p>Brak potwierdzonego wspólnego bana dla tej pary.</p>'}
    ${missing.length ? `<p class="note">${esc(missing.join(', '))} · brak danych o dostępnych matchupach na tej pozycji.</p>` : ''}
    ${more(bans.common.slice(2), 'common', 'Pozostałe wspólne bany')}
    ${more(bans.covered, 'covered', 'Drugi pick ma korzystny matchup')}
    ${more(bans.other, 'other', 'Trudny dla jednego picku')}
    </div>`;
}

function pickPoolPanel(pool) {
  if (!pool) return '';
  const heading = `<div class="panel-head"><h3>${pool.bans ? 'Wspólny ban dla moich picków' : 'Porównaj moje picki'} · ${esc(roleNames[pool.role])}</h3><button data-pool-edit>Edytuj pulę</button></div>`;
  if (pool.options.length < 2) return `<section class="panel" data-pick-pool>${heading}<p class="note">Dodaj ${pool.options.length ? 'jeszcze jedną postać' : 'dwie postacie'} do puli tej roli, aby porównać je w drafcie.</p></section>`;
  const cards = pool.cards.map((c,i) => {
    const options = pool.options.map(o => {
      const blocked = !['Dostępny','Dostępność niepotwierdzona'].includes(o.availability);
      return `<option value="${esc(o.alias)}" ${o.alias === c.alias ? 'selected' : ''}>${esc(o.name)}${blocked ? ' · ' + esc(o.availability) : ''}</option>`;
    }).join('');
    return `<article data-pool-card="${esc(c.alias)}"><select aria-label="${i ? 'Drugi' : 'Pierwszy'} pick" data-pool-side="${i}">${options}</select>
      <small class="${c.availability === 'Dostępny' ? 'good' : 'muted'}">${esc(c.availability)}</small>
      ${pool.bans ? '' : `<h4>Co wnosi</h4><p>${esc(c.advantage)}</p><h4>Koszt wyboru</h4><p>${esc(c.cost)}</p>`}</article>`;
  }).join('');
  if (pool.bans) return `<section class="panel" data-pick-pool data-pool-position="${esc(pool.role)}">${heading}
    <div class="pool-cards">${cards}</div>${poolBanResults(pool)}</section>`;
  const names = team => esc(team.join(', ') || 'brak');
  return `<section class="panel" data-pick-pool data-pool-position="${esc(pool.role)}">${heading}
    <p class="note">Zablokowani sojusznicy · ${names(pool.allies)}<br>Ujawnieni rywale · ${names(pool.enemies)}</p>
    <div class="pool-cards">${cards}</div>
    <p class="note">Ocena według profili postaci.${pool.lane ? ' ' + (pool.inferredLane ? 'Przewidywany' : 'Przypisany') + ' rywal na linii · ' + esc(pool.lane) + '.' : ''}</p></section>`;
}

async function openPickPool() {
  if (document.getElementById('pick-pool-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'pick-pool-dialog';
  dialog.setAttribute('aria-labelledby', 'pick-pool-title');
  dialog.innerHTML = `<div class="panel-head"><h2 id="pick-pool-title">Moja pula SoloQ</h2><button data-pool-close>Zamknij</button></div>
    <p class="note">Pula jest zapisywana na tym komputerze osobno dla każdej roli.</p>
    <label>Rola<select data-pool-role>${Object.entries(roleNames).map(([id,name]) => `<option value="${id}">${esc(name)}</option>`).join('')}</select></label>
    <div class="actions"><label>Postać<select data-pool-add-alias></select></label><button data-pool-add>Dodaj do puli</button></div>
    <div data-pool-list></div><p class="form-error" role="alert"></p>`;
  document.body.appendChild(dialog);
  const role = dialog.querySelector('[data-pool-role]');
  role.value = (labActive ? labInput.role : lastState?.pickPool?.role) || 'bottom';
  if (!role.value) role.value = 'bottom';
  const select = dialog.querySelector('[data-pool-add-alias]');
  const add = dialog.querySelector('[data-pool-add]');
  const error = dialog.querySelector('[role=alert]');
  const list = dialog.querySelector('[data-pool-list]');
  const close = dialog.querySelector('[data-pool-close]');
  close.onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  dialog.showModal();
  role.disabled = select.disabled = add.disabled = true;
  try {
    const data = await window.assist.getPickPools();
    if (!dialog.open) return;
    if (!data.ok) throw Error(data.error);
    const names = new Map(data.champions.map(c => [c.alias, c.name]));
    function draw() {
      const pool = data.roles[role.value].aliases;
      select.innerHTML = data.champions.filter(c => !pool.includes(c.alias)).map(c =>
        `<option value="${esc(c.alias)}">${esc(c.name)}</option>`).join('');
      list.innerHTML = pool.length ? pool.map(alias =>
        `<button data-pool-remove="${esc(alias)}" aria-label="Usuń ${esc(names.get(alias) || alias)} z puli">${esc(names.get(alias) || alias)} ×</button>`).join(' ') : '<span class="muted">Pula tej roli jest pusta.</span>';
      role.disabled = false;
      select.disabled = add.disabled = !select.options.length;
      list.inert = false;
    }
    async function change(action, alias) {
      role.disabled = select.disabled = add.disabled = list.inert = true;
      error.textContent = '';
      try {
        const result = await window.assist.editPickPool({role: role.value, action, alias});
        if (!result.ok) throw Error(result.error);
        data.roles = result.roles;
      } catch (err) { error.textContent = err.message; }
      finally { if (dialog.open) draw(); }
    }
    role.onchange = draw;
    add.onclick = () => change('add', select.value);
    list.onclick = e => {
      const button = e.target.closest('[data-pool-remove]');
      if (button) change('remove', button.dataset.poolRemove);
    };
    draw();
  } catch (err) { error.textContent = err.message; }
}

document.getElementById('app').addEventListener('click', e => {
  if (e.target.closest('[data-pool-edit]')) openPickPool();
});
document.getElementById('app').addEventListener('change', async e => {
  const select = e.target.closest('[data-pool-side]');
  if (!select) return;
  const role = select.closest('[data-pick-pool]').dataset.poolPosition;
  try {
    const result = await window.assist.editPickPool({role, action:'compare', side:Number(select.dataset.poolSide), alias:select.value});
    if (!result.ok) throw Error(result.error);
  } catch (err) {
    select.value = lastState?.pickPool?.cards[Number(select.dataset.poolSide)]?.alias || '';
    toast(err.message, true);
  }
});
