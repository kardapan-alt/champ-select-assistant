async function openLaneVariants(view) {
  if (!view || document.getElementById('lane-variants-dialog')) return;
  const dialog=document.createElement('dialog');
  dialog.id='lane-variants-dialog';
  dialog.dataset.key=view.key;
  dialog.setAttribute('aria-labelledby','lane-variants-title');
  dialog.innerHTML=`<div class="panel-head"><h2 id="lane-variants-title">Warianty linii</h2><button data-close-variants>Zamknij</button></div>
    <p class="note">Wybierz dwa możliwe ustawienia ujawnionych rywali. Podgląd zachowuje aktywną stronę run i zestaw przedmiotów.</p>
    <div class="variant-columns">${['A','B'].map((label,i)=>`<label>Wariant ${label}<select data-lane-variant-side="${i}">${view.options.map((o,j)=>`<option value="${esc(o.id)}" ${j===i?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`).join('')}</div>
    <div data-lane-differences aria-live="polite"></div>`;
  document.body.appendChild(dialog);
  dialog.querySelector('[data-close-variants]').onclick=()=>dialog.close();
  dialog.onclose=()=>dialog.remove();
  const selectors=[...dialog.querySelectorAll('select')];
  const result=dialog.querySelector('[data-lane-differences]');
  let previous=selectors.map(s=>s.value), revision=0;
  async function calculate(index) {
    if(index!==undefined && selectors[index].value===selectors[1-index].value) selectors[1-index].value=previous[index];
    previous=selectors.map(s=>s.value);
    const request=++revision;
    result.textContent='Przeliczam warianty…';
    try {
      const response=await window.assist.previewLaneVariants({key:view.key,ids:previous});
      if(!response.ok) throw Error(response.error);
      if(!dialog.open || revision!==request)return;
      result.innerHTML=response.rows.length ? `<table><thead><tr><th>Różnice</th><th>Wariant A</th><th>Wariant B</th></tr></thead><tbody>
        ${response.rows.map(row=>`<tr><th scope="row">${esc(row.title)}</th>${row.values.map(lines=>`<td>${lines.length?lines.map(line=>`<p>${esc(line)}</p>`).join(''):'—'}</td>`).join('')}</tr>`).join('')}</tbody></table>` :
        '<p>Oba ustawienia dają te same runy, pierwszy zakup i wskazówki na linię.</p>';
    } catch (err) {if(dialog.open && revision===request) result.textContent=err.message;}
  }
  selectors.forEach((s,i)=>{s.onchange=()=>calculate(i);});
  dialog.showModal();
  await calculate();
}
document.getElementById('app').addEventListener('click',event=>{
  if(event.target.closest('[data-lane-variants]')) openLaneVariants(lastState?.laneVariants);
});
