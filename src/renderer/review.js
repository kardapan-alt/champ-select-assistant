const reviewTime=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
function recentMatchCard(m){return `<section class="panel recent-match"><h3>Podsumowanie ostatniego meczu</h3><b>${esc(m.name)} · ${esc(m.mode==='mayhem'?'ARAM: Mayhem':m.mode==='aram'?'ARAM':'Summoner’s Rift')}</b><p>Zapis do ${reviewTime(m.duration)} · ${m.augments.length} augmentów · ${m.events.length} zmian w historii</p><button data-open-review>Otwórz podsumowanie</button></section>`;}
async function openMatchReviews(){
  const response=await window.assist.matchReviews();if(!response.ok)throw Error(response.error);
  let dialog=document.getElementById('review-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='review-dialog';document.body.appendChild(dialog);}
  let matches=response.matches;
  const renderReview=key=>{
    const m=matches.find(m=>m.key===key)||matches[0];
    const names=list=>list.map(i=>`${i.count>1?i.count+' × ':''}${esc(i.name)}`).join(', ');
    dialog.innerHTML=`<div class="panel-head"><h2>Po meczu</h2><button data-close-review>Zamknij</button></div>${!m?'<p>Podsumowanie pojawi się po meczu, w którym aplikacja odczyta Twój ekwipunek. Zapisujemy lokalnie ostatnie 10 meczów.</p>':`
      <label>Mecz<select id="review-match">${matches.map(r=>`<option value="${esc(r.key)}" ${r.key===m.key?'selected':''}>${esc(r.name)} · ${esc(new Date(r.endedAt).toLocaleString('pl-PL'))}</option>`).join('')}</select></label>
      <h3>${esc(m.name)} · ${esc(m.mode==='mayhem'?'ARAM: Mayhem':m.mode==='aram'?'ARAM':'Summoner’s Rift')}</h3>
      <p class="note">Zapis od ${reviewTime(m.firstRead)} do ${reviewTime(m.duration)}. ${m.reason==='ended'?'Klient potwierdził koniec gry.':'Zakończono zapis; nie potwierdzono momentu końca gry.'} Zmiany ekwipunku mogą oznaczać zakupy, sprzedaż, łączenie części lub nagrody. ${m.trimmed?'Pokazuję ostatnie 200 zdarzeń.':''} ${m.gap?'Końcowy odczyt był niedostępny.':''}</p>
      ${m.headliner?`<p><b>Headliner:</b> ${esc(m.headliner.name)} ${esc(m.headliner.ability)}</p>`:''}
      <h4>Ostatnio zapisane augmenty</h4><p>${names(m.augments)||'Brak zapisanych augmentów'}</p>
      ${(m.synergies||[]).map(p=>`<p class="good">${esc(p.names.join(' + '))}: ${esc(p.text)}</p>`).join('')}
      <h4>Ostatni odczyt ekwipunku</h4><div class="review-items">${m.items.map(i=>`<div>${img(i.icon,'shop-icon',i.name)}<span>${i.count>1?i.count+' × ':''}${esc(i.name)}</span></div>`).join('')||'Pusty ekwipunek'}</div>
      <details class="review-timeline"><summary>Historia ekwipunku, augmentów i porad (${m.events.length})</summary><ol>${m.events.map(e=>`<li><time>${reviewTime(e.time)}</time> ${e.type==='initial'?`Pierwszy odczyt: ${names(e.added)||'pusto'}`:e.type==='inventory'?`${e.added.length?'Przybyło: '+names(e.added)+'. ':''}${e.removed.length?'Ubyło: '+names(e.removed):''}`:e.type==='plan'?e.target?`Cel zakupów: <b>${esc(e.target.name)}</b> — ${esc(e.target.why)}`:'Build kupiony lub brak dostępnego celu.':e.type==='gap'?'Przerwa w odczycie — część zmian mogła nie zostać zapisana.':`Zestaw augmentów: ${names(e.augments)||'pusto'}${e.headliner?' · Headliner: '+esc(e.headliner.name):''}`}</li>`).join('')}</ol></details>
      <form id="review-feedback"><h4>Twoja ocena</h4><div class="choice-grid"><label>Wynik · wpisujesz samodzielnie<select name="result">${[['unknown','Nie zapisano'],['win','Wygrana'],['loss','Przegrana']].map(([v,t])=>`<option value="${v}" ${(m.feedback?.result||'unknown')===v?'selected':''}>${t}</option>`).join('')}</select></label><label>Czy porady pomogły?<select name="rating">${[['none','Jeszcze nie oceniam'],['helpful','Pomogły'],['mixed','Częściowo'],['unhelpful','Nie pomogły']].map(([v,t])=>`<option value="${v}" ${(m.feedback?.rating||'none')===v?'selected':''}>${t}</option>`).join('')}</select></label></div><button type="submit">Zapisz ocenę</button><p role="status" id="feedback-status"></p></form>
      <p class="note">Historia jest lokalna, bez nazw kont przeciwników. Wynik meczu nie dowodzi skuteczności konkretnej porady.</p>`}`;
    dialog.querySelector('[data-close-review]').onclick=()=>dialog.close();
    if(!m)return;
    dialog.querySelector('#review-match').onchange=e=>renderReview(e.target.value);
    dialog.querySelector('#review-feedback').onsubmit=async e=>{
      e.preventDefault();const v=new FormData(e.target),button=e.target.querySelector('button');button.disabled=true;
      try{const r=await window.assist.reviewFeedback({key:m.key,result:v.get('result'),rating:v.get('rating')});if(!r.ok)throw Error(r.error);matches=matches.map(x=>x.key===m.key?r.match:x);dialog.querySelector('#feedback-status').textContent='Ocena zapisana.';}catch(error){dialog.querySelector('#feedback-status').textContent=error.message;}finally{button.disabled=false;}
    };
  };
  renderReview();dialog.showModal();
}
document.getElementById('match-history').onclick=()=>openMatchReviews().catch(e=>toast(e.message,true));
document.getElementById('app').addEventListener('click',e=>{if(e.target.closest('[data-open-review]'))openMatchReviews().catch(e=>toast(e.message,true));});
document.getElementById('riot-info').onclick=()=>document.getElementById('riot-dialog').showModal();
document.querySelector('[data-close-riot]').onclick=()=>document.getElementById('riot-dialog').close();
document.getElementById('open-riot-policy').onclick=async()=>{try{const r=await window.assist.openRiotPolicy();if(!r.ok)throw Error(r.error);}catch(e){toast(e.message,true);}};
