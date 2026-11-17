const reviewTime=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
function recentMatchCard(m){return `<section class="panel recent-match"><h3>Podsumowanie ostatniego meczu</h3><b>${esc(m.name)} · ${esc(m.mode==='mayhem'?'ARAM: Mayhem':m.mode==='aram'?'ARAM':'Summoner’s Rift')}</b><p class="review-result">${esc(reviewOutcome(m))}</p><p>${m.firstRead==null?'Brak odczytu ekwipunku':'Zapis do '+reviewTime(m.duration)}${m.mode==='mayhem'?' · '+m.augments.length+' augmentów':''} · ${m.events.length} zmian w historii</p><button data-open-review>Otwórz podsumowanie</button></section>`;}
function reviewOutcome(m){
  const manual=['win','loss'].includes(m.feedback?.result),result=manual?m.feedback.result:m.outcome?.result;
  if(!['win','loss'].includes(result))return 'Wynik: brak potwierdzonych danych z klienta gry.';
  const source=manual?'ręczna korekta':{live:'automatycznie · koniec gry',client:'automatycznie · klient LoL',history:'automatycznie · historia meczu'}[m.outcome.source];
  return (result==='win'?'Wygrana':'Przegrana')+' · '+source;
}
let refreshOpenReview=null;
function augmentImpactView(match) {
  if (match.mode!=='mayhem' || !match.augments?.length) return '';
  const title = '<h4>Build przed i po augmencie</h4>';
  if (!match.augmentComparisons?.length) return title+'<p>W tym meczu zapisano karty bez porównań z chwili odczytu.</p>';
  const plan = items => items.map(i=>esc(i.name)).join(' → ') || 'Pusty plan';
  const contexts = {first:'Karta była już zapisana przy pierwszym odczycie.',gap:'Kartę odczytano po przerwie w zapisie.',group:'Kilka kart zmieniło się w jednym odczycie.'};
  const choices = match.augments.map(card => {
    const c = match.augmentComparisons.find(x=>x.id===card.id);
    if (!c?.before || !c?.after) return `<p><b>${esc(card.name)}</b> · Brak zapisanego porównania.</p>`;
    const moved = c.changes || [], upgraded = c.beforeUpgrade?.id!==c.afterUpgrade?.id;
    const result = c.supported===false ? 'Brak sprawdzonej reguły' : moved.length || upgraded ? 'Zmiana planu' : 'Ta sama kolejność zakupów';
    const reasons = moved.map(i=>{
      const change = i.from==null ? `dodany na pozycję ${i.to}` : i.to==null ? `wypadł z pozycji ${i.from}` : `pozycja ${i.from} → ${i.to}`;
      const reason=i.to==null?i.previousReason:i.reason;
      return `<li><b>${esc(i.name)}</b> · ${change}${reason?`<span class="muted"> · ${i.to==null?'wcześniej: ':''}${esc(reason)}</span>`:''}</li>`;
    }).join('');
    const related = (c.requiredItems||[]).map(i=>{
      const slot=c.after.findIndex(item=>item.id===i.id)+1;
      const status=i.status==='owned'?'już kupiony':slot?`pozycja ${slot}`:'poza planem';
      return `<p><b>${esc(i.name)}</b> · ${status}</p>`;
    }).join('');
    return `<details class="augment-impact"><summary><b>${esc(card.name)}</b> · ${result}</summary>
      <p class="muted">Odczyt ${reviewTime(c.time)}. ${contexts[c.context] || ''}</p>
      <p>${esc(c.summary)}</p><p><b>Bez tej karty</b> · ${plan(c.before)}</p><p><b>Z tą kartą</b> · ${plan(c.after)}</p>
      ${reasons?`<ul>${reasons}</ul>`:''}${upgraded?`<p>Cel ulepszenia · ${esc(c.beforeUpgrade?.name||'brak')} → ${esc(c.afterUpgrade?.name||'brak')}</p>`:''}
      ${related?`<div><b>Przedmioty powiązane z kartą</b>${related}</div>`:''}</details>`;
  }).join('');
  return title+'<p class="note">Porównanie zmienia jedną kartę. W obu planach zachowujemy ten sam ekwipunek, pozostałe augmenty, skład i przypięcia.</p>'+choices;
}
async function openMatchReviews(){
  const response=await window.assist.matchReviews();if(!response.ok)throw Error(response.error);
  let dialog=document.getElementById('review-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='review-dialog';document.body.appendChild(dialog);}
  let matches=response.matches;
  const renderReview=key=>{
    const m=matches.find(m=>m.key===key)||matches[0];
    const names=list=>list.map(i=>`${i.count>1?i.count+' × ':''}${esc(i.name)}`).join(', ');
    dialog.innerHTML=`<div class="panel-head review-head"><h2>Po meczu</h2><div class="actions"><button data-compare-versions>Porównaj wersje</button><button data-open-favorites>Ulubione kombinacje</button><button data-close-review>Zamknij</button></div></div>${!m?'<p>Po meczu znajdziesz tu zapis ekwipunku, ofert Mayhem lub swojego celu treningowego. Historia mieści 10 ostatnich podsumowań na tym komputerze.</p>':`
      <label>Mecz<select id="review-match">${matches.map(r=>`<option value="${esc(r.key)}" ${r.key===m.key?'selected':''}>${esc(r.name)} · ${esc(new Date(r.endedAt).toLocaleString('pl-PL'))}</option>`).join('')}</select></label>
      <h3>${esc(m.name)} · ${esc(m.mode==='mayhem'?'ARAM: Mayhem':m.mode==='aram'?'ARAM':'Summoner’s Rift')}</h3>
      ${m.mode==='mayhem' && (m.augments?.length || m.items?.length) ? `<button data-save-favorite="${esc(m.key)}">Dodaj do ulubionych</button>` : ''}
      <p id="review-outcome" class="review-result" aria-live="polite">${esc(reviewOutcome(m))}</p>
      ${trainingResultPanel(m)}
      <p class="note">${m.firstRead==null?'Brak odczytu ekwipunku.':`Zapis od ${reviewTime(m.firstRead)} do ${reviewTime(m.duration)}.`} ${m.reason==='ended'?'Klient potwierdził koniec gry.':'Zakończono zapis; nie potwierdzono momentu końca gry.'} Zmiany ekwipunku mogą oznaczać zakupy, sprzedaż, łączenie części lub nagrody. ${m.trimmed?'Pokazuję ostatnie 200 zdarzeń.':''} ${m.gap?'Końcowy odczyt był niedostępny.':''}</p>
      ${m.headliner?`<p><b>Headliner:</b> ${esc(m.headliner.name)} ${esc(m.headliner.ability)}</p>`:''}
      <h4>Ostatnio zapisane augmenty</h4><p>${names(m.augments)||'Brak zapisanych augmentów'}</p>
      ${(m.synergies||[]).map(p=>`<p class="good">${esc(p.names.join(' + '))}: ${esc(p.text)}</p>`).join('')}
      ${offerHistoryPanel(m)}
      ${augmentImpactView(m)}
      <h4>Ostatni odczyt ekwipunku</h4><div class="review-items">${m.items.map(i=>`<div>${img(i.icon,'shop-icon',i.name)}<span>${i.count>1?i.count+' × ':''}${esc(i.name)}</span></div>`).join('')||(m.firstRead==null?'Brak odczytu':'Pusty ekwipunek')}</div>
      <details class="review-timeline"><summary>Historia ekwipunku, augmentów i porad (${m.events.length})</summary><ol>${m.events.map(e=>`<li><time>${reviewTime(e.time)}</time> ${e.type==='initial'?`Pierwszy odczyt: ${names(e.added)||'pusto'}`:e.type==='inventory'?`${e.added.length?'Przybyło: '+names(e.added)+'. ':''}${e.removed.length?'Ubyło: '+names(e.removed):''}`:e.type==='plan'?e.target?`Cel zakupów: <b>${esc(e.target.name)}</b> — ${esc(e.target.why)}`:'Build kupiony lub brak dostępnego celu.':e.type==='gap'?'Przerwa w odczycie — część zmian mogła nie zostać zapisana.':`Zestaw augmentów: ${names(e.augments)||'pusto'}${e.headliner?' · Headliner: '+esc(e.headliner.name):''}`}</li>`).join('')}</ol></details>
      <form id="review-feedback"><h4>Twoja ocena</h4><div class="choice-grid"><label>Wynik · opcjonalna korekta<select name="result">${[['auto','Automatycznie z gry'],['win','Wygrana — moja korekta'],['loss','Przegrana — moja korekta']].map(([v,t])=>`<option value="${v}" ${(['win','loss'].includes(m.feedback?.result)?m.feedback.result:'auto')===v?'selected':''}>${t}</option>`).join('')}</select></label><label>Czy porady pomogły?<select name="rating">${[['none','Jeszcze nie oceniam'],['helpful','Pomogły'],['mixed','Częściowo'],['unhelpful','Nie pomogły']].map(([v,t])=>`<option value="${v}" ${(m.feedback?.rating||'none')===v?'selected':''}>${t}</option>`).join('')}</select></label></div><button type="submit">Zapisz ocenę</button><p role="status" id="feedback-status"></p></form>
      <p class="note">Historia jest lokalna, bez nazw kont przeciwników. Wynik meczu nie dowodzi skuteczności konkretnej porady.</p>`}`;
    dialog.querySelector('[data-close-review]').onclick=()=>dialog.close();
    if(!m){refreshOpenReview=null;return;}
    bindOfferHistory(dialog,m,renderReview);
    refreshOpenReview=fresh=>{if(fresh.key!==m.key)return;Object.assign(m,fresh);const badge=dialog.querySelector('#review-outcome');if(badge)badge.textContent=reviewOutcome(m);};
    dialog.querySelector('#review-match').onchange=e=>renderReview(e.target.value);
    dialog.querySelector('#review-feedback').onsubmit=async e=>{
      e.preventDefault();const v=new FormData(e.target),button=e.target.querySelector('button');button.disabled=true;
      try{const r=await window.assist.reviewFeedback({key:m.key,result:v.get('result'),rating:v.get('rating')});if(!r.ok)throw Error(r.error);matches=matches.map(x=>x.key===m.key?r.match:x);Object.assign(m,r.match);dialog.querySelector('#review-outcome').textContent=reviewOutcome(m);dialog.querySelector('#feedback-status').textContent='Ocena zapisana.';}catch(error){dialog.querySelector('#feedback-status').textContent=error.message;}finally{button.disabled=false;}
    };
  };
  renderReview();dialog.showModal();
}
window.assist.onState(s=>{if(document.getElementById('review-dialog')?.open&&s.recentMatch)refreshOpenReview?.(s.recentMatch);});
document.getElementById('match-history').onclick=()=>openMatchReviews().catch(e=>toast(e.message,true));
document.getElementById('app').addEventListener('click',e=>{if(e.target.closest('[data-open-review]'))openMatchReviews().catch(e=>toast(e.message,true));});
document.getElementById('riot-info').onclick=()=>document.getElementById('riot-dialog').showModal();
document.querySelector('[data-close-riot]').onclick=()=>document.getElementById('riot-dialog').close();
document.getElementById('open-riot-policy').onclick=async()=>{try{const r=await window.assist.openRiotPolicy();if(!r.ok)throw Error(r.error);}catch(e){toast(e.message,true);}};
