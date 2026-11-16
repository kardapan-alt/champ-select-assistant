function readAge(at,now=Date.now()){
  if(!Number.isFinite(at)||at<=0||at>now)return 'brak odczytu';
  const seconds=Math.floor((now-at)/1000);
  return seconds<60?`${seconds} s temu`:`${Math.floor(seconds/60)} min temu`;
}
const freshRead=(source,now=Date.now())=>source?.status==='live'&&Number.isFinite(source.at)&&source.at>0&&now>=source.at&&now-source.at<6000;
function readoutRows(b){
  const r=b.readout;if(!r)return '';
  const rows=[];
  for(const [key,label] of [['inventory','Ekwipunek i złoto'],['enemies','Zakupy wrogów']]){
    const source=r[key],fresh=freshRead(source),manual=source.status==='manual';
    const missingGold=key==='inventory'&&!source.goldKnown;
    const text=manual?'Ustawiane ręcznie':fresh?`${missingGold?'Brak odczytu złota':'Aktualne'} · ${readAge(source.at)}`
      :source.at?`Przerwa · ostatnio ${readAge(source.at)}`:'Czekam na dane gry';
    rows.push({key,label,text:text+(source.unknown?` · ${source.unknown} poza katalogiem`:''),tone:manual?'muted':fresh&&!source.unknown&&!missingGold?'good':'readout-warning'});
  }
  if(r.screen){
    const s=r.screen,stopped={off:'OCR wyłączony',paused:'OCR wstrzymany',language:'Brak języka OCR',conflict:'Sprawdź wybór ręcznie',layout:'Zmieniona rozdzielczość',ambiguous:'Niepewny odczyt',waiting:'Czekam na obraz'};
    stopped['capture-error']=s.error||'Nie udało się przechwycić obrazu gry';
    stopped['ocr-error']='OCR nie odpowiada · ponawiam odczyt';
    const recent=s.at&&Date.now()-s.at<6000;
    const status=!s.enabled?'OCR wyłączony':stopped[s.status]||(!recent?'Brak świeżego obrazu':s.mode==='auto'?'OCR działa':'OCR po najechaniu');
    rows.push({key:'augments',label:'Augmenty',text:`Zapisane: ${s.count} · ${status}${s.unknown?` · ${s.unknown} bez reguł`:''}`,
      tone:s.enabled&&recent&&!stopped[s.status]&&!s.unknown?'good':'readout-warning'});
    const h=r.headliner;
    rows.push({key:'headliner',label:'Headliner',text:h.name?`${h.name} · ${h.source==='screen'?'OCR':'ręcznie'}`
      :h.auto?h.available?'Czekam na nazwę i opis':'Wymaga automatycznego OCR':'Nie ustawiono',tone:h.name?'good':'muted'});
  }
  return rows.map(r=>`<div class="readout-item" data-readout="${r.key}"><b>${r.label}</b><span class="${r.tone}">${esc(r.text)}</span></div>`).join('');
}
function readoutPanel(b){return b.readout&&!labActive?`<section class="readout" aria-label="Status odczytu">${readoutRows(b)}</section>`:'';}
function buildChangePanel(b){
  const c=b.lastChange;if(!c||labActive)return '';
  const current=!b.readout||(freshRead(b.readout.inventory)&&b.readout.inventory.goldKnown&&freshRead(b.readout.enemies));
  return `<aside class="build-change" aria-label="Dlaczego zmienił się build"><div class="change-heading"><b>${esc(current?c.title:'Ostatnia zmiana z pełnego odczytu')}</b><span>Ostatnia zmiana · <time data-change-at="${c.at}">${readAge(c.at)}</time></span></div>
    <p>${esc((current?'':c.title+' · ')+(c.causes.join(' ')||c.reason))}</p>
    ${disclosure('last-build-change','Co się zmieniło?',`<p><b>Powód aktualnego wyboru:</b> ${esc(c.reason)}</p><p><b>Poprzedni cel:</b> ${esc(c.beforeTarget||'Brak')}</p><p><b>Obecny cel:</b> ${esc(c.afterTarget||'Brak')}</p><p><b>Było:</b> ${esc(c.before.join(' → '))}${c.beforeBoots?' · buty: '+esc(c.beforeBoots):''}</p><p><b>Jest:</b> ${esc(c.after.join(' → '))}${c.afterBoots?' · buty: '+esc(c.afterBoots):''}</p>${c.evidence.map(e=>`<p><b>${esc(e.name)}:</b> ${esc(e.items.map(i=>i.name).join(', '))}</p>`).join('')}<p class="note">Porównanie potwierdzonych odczytów tego meczu. Przerwa w połączeniu nie jest traktowana jako sprzedaż.</p>`)}
  </aside>`;
}
// Age keeps advancing without new IPC messages. Also expire the shopping advice
// if the main process stops sending fresh snapshots while the window is open.
setInterval(()=>{
  if(labActive||lastState?.status!=='loading-screen')return;
  const b=lastState.final?.build,node=document.querySelector('.readout');
  if(b?.readout&&node){
    patch(node,readoutRows(b));
    if(b.readout.inventory.status==='live'&&!freshRead(b.readout.inventory)&&document.querySelector('.live-shop[data-fresh="true"]'))render(lastState);
  }
  document.querySelectorAll('[data-change-at]').forEach(el=>{el.textContent=readAge(Number(el.dataset.changeAt));});
},1000);
