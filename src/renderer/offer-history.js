function offerPlanView(offer, card) {
  if (!card) return '';
  if (!offer.before || !card.plan) return '<p>Brak porównania dla tej karty w zapisanej sytuacji.</p>';
  const picked = offer.cards.find(c=>c.id===offer.picked);
  const reference = picked?.id!==card.id && picked?.plan ? picked : null;
  const before = reference?.plan || offer.before;
  const order = list => list.map(i=>esc(i.name)+(i.side?' (boczny slot)':'')).join(' → ') || 'Pusty plan';
  const same = before.length===card.plan.length && before.every((item,i)=>item.id===card.plan[i].id && item.side===card.plan[i].side);
  return `<p><b>${reference?'Po wyborze „'+esc(reference.name)+'”':'Przed wyborem'}</b> · ${order(before)}</p>
    <p><b>Po wyborze „${esc(card.name)}”</b> · ${same?'Ta sama kolejność zakupów':order(card.plan)}</p>`;
}

function historyOfferView(offer, previewId) {
  const picked = offer.cards.find(c=>c.id===offer.picked);
  const card = offer.cards.find(c=>c.id===previewId) || picked || offer.cards[0];
  const status = picked ? `Wybrano ${picked.name}${offer.source==='manual'?' · Twoja korekta':offer.source==='confirmed'?' · potwierdzono w meczu':''}` : offer.replacedBy ? 'Przerzucona' : 'Wybór niepotwierdzony';
  const when = Number.isFinite(offer.time) ? reviewTime(offer.time) : 'Brak czasu gry';
  const positions = ['Lewa','Środkowa','Prawa'];
  return `<summary><b>${esc(when)}</b> · ${esc(status)}</summary>
    <div class="offer-history-cards">${offer.cards.map((c,i)=>`<button type="button" data-history-card="${c.id}" aria-pressed="${c.id===card.id}">
      <small>${positions[i]}${c.id===offer.picked?' · Wybrana':''}</small><b>${esc(c.name)}</b>${c.english!==c.name?`<small lang="en">${esc(c.english)}</small>`:''}</button>`).join('')}</div>
    <div data-history-plan>${offerPlanView(offer,card)}</div>
    <p class="note">${offer.inventory==='live'?'Porównanie z ekwipunkiem i ustawieniami z chwili odczytu.':offer.inventory==='manual'?'Porównanie z ręcznie ustawionym ekwipunkiem z chwili odczytu.':'Brak danych do przeliczenia zakupów w chwili odczytu.'}</p>
    ${!offer.replacedBy && !['screen','confirmed'].includes(offer.source) ? `<div class="actions">
      ${card.id!==offer.picked?`<button type="button" data-history-correct="${card.id}">Wybrałem tę kartę</button>`:''}
      ${offer.source==='manual'?'<button type="button" data-history-correct="">Cofnij korektę</button>':''}</div>`:''}
    <p class="note" role="status" aria-live="polite"></p>`;
}

function offerHistoryPanel(match) {
  if (match.mode!=='mayhem') return '';
  return `<section data-offer-history><h4>Historia trzech kart</h4>
    ${match.offers?.length ? (match.offersTrimmed?'<p class="note">Pokazuję ostatnie 64 oferty.</p>':'')+
      match.offers.map(offer=>`<details data-history-offer="${offer.id}" data-picked="${offer.picked||''}">${historyOfferView(offer)}</details>`).join('')
      : '<p class="note">Brak zapisanych pełnych ofert z tego meczu.</p>'}</section>`;
}

function bindOfferHistory(dialog,match,rerender) {
  const history=dialog.querySelector('[data-offer-history]');
  if (!history) return;
  history.onclick=async e=>{
    const button=e.target.closest('button');
    const row=button?.closest('[data-history-offer]');
    const offer=match.offers?.find(o=>o.id===Number(row?.dataset.historyOffer));
    if (!offer || row.dataset.busy) return;
    if (button.hasAttribute('data-history-card')) {
      const cardId=Number(button.dataset.historyCard);
      row.innerHTML=historyOfferView(offer,cardId);
      row.querySelector(`[data-history-card="${cardId}"]`).focus({preventScroll:true});
    }
    if (button.hasAttribute('data-history-correct')) {
      row.dataset.busy='1';
      const cardId=Number(button.dataset.historyCorrect)||null;
      try {
        const result=await window.assist.correctOfferChoice({key:match.key,offerId:offer.id,cardId});
        if (!result.ok) throw Error(result.error);
        Object.assign(match,result.match);
        if (dialog.querySelector('#review-match')?.value!==match.key) return;
        rerender(match.key);
        const refreshed=dialog.querySelector(`[data-history-offer="${offer.id}"]`);
        refreshed.open=true;
        refreshed.querySelector('[role=status]').textContent=cardId?'Zapisano Twój wybór w podsumowaniu.':'Cofnięto korektę.';
      } catch (err) { row.querySelector('[role=status]').textContent=err.message; }
      finally { delete row.dataset.busy; }
    }
  };
}
