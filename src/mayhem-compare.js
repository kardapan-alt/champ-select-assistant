const mayhem=require('./mayhem');
const rules=require('./mayhem-rules');
const catalog=require('../data/mayhem-augments.json').augments;
const byId=new Map(catalog.map(a=>[a.id,a]));
const {synergies}=require('./augment-synergies');
const {itemInteraction}=require('./mayhem-interactions');
const {MAX_AUGMENTS}=require('./headliners');
const ruleFor=a=>rules[a?.api?.replace(/^ARAM_/,'')];

// This compares evidenced build fit, not win rate or overall augment power.
// Keep the game's left/middle/right order; a tie has no invented winner.
function evaluateAugments(ids,{champion={},selection={},build={},game,pool='KIWI',enemy={}}){
  const picked=(selection.augments||[]).map(id=>byId.get(id)).filter(Boolean),active=picked.map(ruleFor).filter(Boolean);
  const owned=new Set(selection.owned||[]),planned=new Set((build.items||[]).filter(i=>!i.owned).map(i=>i.id));
  const itemName=id=>game.items.get(id)?.name||String(id);
  const current=mayhem.adaptation(selection,champion,{enemy,game});
  const conversion=active.map(r=>r.conversion).find(Boolean);
  const currentChampion=conversion?{...champion,dmg:conversion,class:conversion==='ap'?'mage':'fighter'}:champion;
  const cards=ids.map((id,index)=>{
    const a=byId.get(id),r=ruleFor(a),reasons=[],warnings=[];
    const card={id,position:index,name:a.name,english:a.english,summary:r?.summary||'Brak sprawdzonej reguły.',interaction:itemInteraction(a,champion,game),reasons,warnings,score:0,status:'conditional',recommended:false};
    if(!r){card.status='unknown';reasons.push('Nie mam jeszcze sprawdzonej oceny tego augmentu.');return card;}
    if((selection.augments||[]).includes(id)){card.status='selected';warnings.push('Ten augment jest już zapisany jako wybrany.');return card;}
    if(picked.length>=MAX_AUGMENTS){card.status='conflict';warnings.push('Limit zapisu augmentów. Sprawdź wcześniejsze rozpoznania.');return card;}
    if(selection.headliner?.id==='heartsteel')warnings.push('HEARTSTEEL: ocena nie obejmuje dodatkowego modyfikatora karty.');
    if(selection.headliner?.id==='pentakill'&&selection.headliner.ability==='R'&&r.noUltimate){warnings.push('Wyłącza R wzmocnione przez Pentakill.');card.score-=8;}
    const noUltimate=active.some(x=>x.noUltimate),noRegen=active.some(x=>x.noRegen),attackConversion=active.map(x=>x.attackConversion).find(Boolean);
    if(noUltimate&&r.ultimate){card.status='conflict';warnings.push('Back To Basics wyłącza R, więc ten efekt ultimate nie zadziała.');return card;}
    if(r.conversion&&active.some(x=>x.conversion)){card.status='conflict';warnings.push('Koliduje z już wybraną konwersją AP/AD.');return card;}
    if(r.noUltimate){warnings.push('Wyłącza Twoje R. Wybór wymaga zmiany sposobu gry.');card.score-=3;
      if(active.some(x=>x.ultimate)){warnings.push('Wyłączy również efekt już wybranego augmentu ultimate.');card.score-=8;}}
    if(r.noRegen&&active.some(x=>x.effects.includes('regen'))){warnings.push('Wyłącza regenerację wzmacnianą przez wcześniejszy augment.');card.score-=8;}
    if(noRegen&&r.effects.includes('regen')){warnings.push('Vampirism blokuje regenerację — ta część efektu nie pomoże.');card.score-=8;}
    if(r.healthConversion&&active.some(x=>x.effects.some(e=>['health','healthhit'].includes(e)))){warnings.push('Konwersja HP zmienia dotychczasowy plan budowania zdrowia.');card.score-=5;}
    if((attackConversion==='onhit'&&r.effects.includes('crit'))||(['crit','haste'].includes(attackConversion)&&r.effects.some(e=>['attacks','onhit'].includes(e)))){warnings.push('Wybrana konwersja ataków ogranicza tę synergię.');card.score-=5;}
    if(r.conversion){warnings.push('Konwersja AP/AD wymaga przebudowy zakupów; ta ocena nie obejmuje całego nowego stylu gry.');card.score-=3;}
    const noHp=active.some(x=>x.healthConversion)||r.healthConversion;
    const affinity=nativeFit(r.effects,currentChampion,{noHp,noRegen:noRegen||r.noRegen,noUltimate:noUltimate||r.noUltimate});
    if(affinity){card.score+=4;reasons.push(affinity);}
    const combinedSelection={...selection,augments:[...(selection.augments||[]),id]};
    card.synergies=synergies(combinedSelection).filter(pair=>pair.ids.includes(id));
    if(card.synergies.length){card.score+=Math.min(6,card.synergies.length*3);reasons.push(...card.synergies.map(pair=>`${pair.names.join(' + ')}: ${pair.text}`));}
    const combined=mayhem.adaptation(combinedSelection,champion,{enemy,game});
    const bonus=new Map();
    for(const [item,b] of combined.bonuses){
      const contributions=b.contributions.filter(c=>c.group.startsWith(`augment ${a.name}:`)||c.group===`augment ${a.name}`);
      if(contributions.length&&!combined.excluded.has(item))bonus.set(item,Math.max(...contributions.map(c=>c.score)));
    }
    const upgradeTargets=mayhem.upgradeTargets(r,currentChampion,selection,enemy);
    const ownedFits=[...owned].filter(item=>bonus.has(item)||upgradeTargets.includes(item)).sort((a,b)=>(bonus.get(b)||0)-(bonus.get(a)||0));
    const plannedFits=[...planned].filter(item=>bonus.has(item)).sort((a,b)=>bonus.get(b)-bonus.get(a));
    if(ownedFits.length){card.score+=8+Math.min(2,ownedFits.length-1);reasons.push(`Wykorzystasz już posiadane: ${ownedFits.slice(0,2).map(itemName).join(', ')}.`);}
    else if(plannedFits.length){card.score+=3;reasons.push(`Pasuje do planowanych zakupów: ${plannedFits.slice(0,2).map(itemName).join(', ')}.`);}
    if(upgradeTargets.some(id=>owned.has(id))){card.score+=4;reasons.push('Bezpośrednio ulepsza przedmiot, który już posiadasz.');}
    const shared=[...bonus.keys()].filter(item=>current.bonuses.has(item)&&(owned.has(item)||planned.has(item)));
    if(shared.length){
      const previous=picked.find(p=>current.bonuses.get(shared[0]).reasons.some(why=>why.startsWith(`augment ${p.name}:`)));
      if(previous){card.score+=3;reasons.push(`Wspólne zakupy z „${previous.name}”: ${itemName(shared[0])}.`);}
    }
    const excludedOwned=[...owned].filter(item=>(r.exclude||[]).includes(item));
    if(excludedOwned.length){card.score-=6;warnings.push(`Osłabia dotychczasowy plan z: ${excludedOwned.map(itemName).join(', ')}.`);}
    if(r.quest&&r.items?.length){
      const missing=r.items.filter(item=>!owned.has(item));
      if(missing.length){const cost=missing.reduce((n,id)=>n+(game.items.get(id)?.priceTotal||0),0);
        warnings.push(`Do zadania brakuje: ${missing.map(itemName).join(', ')}${cost?` (łącznie ${cost} złota przed odjęciem komponentów)`:''}.`);}
      else reasons.unshift('Masz przedmioty wymagane do zadania; pozostałe warunki nadal trzeba spełnić.');
    }
    if(r.neutral){card.status='independent';reasons.push('Efekt działa poza dopasowaniem zakupów — brak premii w tej ocenie nie oznacza słabego augmentu.');}
    else card.status=card.score>=10?'strong':card.score>=4?'fit':'conditional';
    if(!reasons.length)reasons.push('Nie widzę wyraźnej synergii z obecnymi zakupami. Sprawdź efekt i swój sposób gry.');
    card.fit={champion:affinity||'Brak wyraźnego dopasowania do klasy postaci.',owned:ownedFits.map(itemName),planned:plannedFits.map(itemName)};
    card.reasons=reasons;return card;
  });
  cards.forEach(c=>{c.grade=gradeFor(c);});
  const ranked=cards.filter(c=>['strong','fit','conditional'].includes(c.status)).sort((a,b)=>b.score-a.score);
  if(ranked[0]?.score>=4&&!ranked[0].warnings.length&&(!ranked[1]||ranked[0].score-ranked[1].score>=3))ranked[0].recommended=true;
  return {cards,note:'S → A → B → C → D → E → F: od najlepszego do najsłabszego dopasowania w obecnym buildzie. „—” oznacza brak oceny. To ocena regułowa dla Ciebie, nie globalna tierlista ani winrate.'};
}
function gradeFor(card){
  if(['unknown','independent','selected'].includes(card.status))return null;
  if(card.status==='conflict')return 'F';
  const score=card.score;
  // Zastrzeżenia nie mogą ukryć się za najwyższą oceną.
  if(score>=14&&!card.warnings.length)return 'S';
  if(score>=10&&!card.warnings.length)return 'A';
  return score>=6?'B':score>=3?'C':score>=0?'D':score>=-4?'E':'F';
}
function compareAugments(ids,context){
  const pool=context?.pool||'KIWI';
  if(!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3||ids.some(id=>!byId.get(id)?.pools.includes(pool)))return null;
  return evaluateAugments(ids,context);
}
function selectedAugmentGrades(context){
  const selection=context.selection||{},pool=context.pool||'KIWI';
  return (selection.augments||[]).filter(id=>byId.get(id)?.pools.includes(pool)).map(id=>{
    // Nie liczymy augmentu jako synergii z samym sobą.
    const other={...selection,augments:selection.augments.filter(a=>a!==id)};
    const card=evaluateAugments([id],{...context,selection:other}).cards[0];
    if(Object.hasOwn(selection.effects||{},id)){card.grade=null;card.warnings=[];card.reasons=['Ręczna korekta efektów — automatyczna ocena nie obejmuje tej zmiany.'];}
    if(selection.completed?.includes(id)){card.grade=null;card.warnings=[];card.reasons=['Zadanie oznaczone jako ukończone.'];}
    return {id,grade:card.grade,reason:card.warnings[0]||card.reasons[0],warnings:card.warnings};
  });
}
function nativeFit(effects,c,{noHp,noRegen,noUltimate}){
  const has=(...e)=>e.some(x=>effects.includes(x)),t=c.traits||[],durable=['tank','fighter'].includes(c.class);
  if(c.unknown)return null;
  if(has('healing','healresists')&&(c.class==='support'||t.includes('enchanter')||t.includes('heal')))return 'Wspiera leczenie i osłony, z których korzysta Twoja postać.';
  if(!noHp&&durable&&has('health','resists','healthhit'))return 'Pasuje do wytrzymałej postaci walczącej w pierwszej linii.';
  if(c.class==='adc'&&has('attacks','onhit','crit','bigcrit','spellblade'))return 'Pasuje do buildu strzelca opartego na regularnych atakach.';
  if((c.class==='mage'||c.dmg==='ap'&&!durable&&c.class!=='support')&&has('ap','spell','haste','spellcrit','burn'))return 'Wspiera obrażenia z umiejętności i skalowanie AP Twojej postaci.';
  if(c.dmg==='ad'&&has('ad','lethality','spellblade','adaptive'))return 'Wspiera fizyczny kierunek obrażeń Twojej postaci.';
  if(t.includes('cc')&&has('cc'))return 'Wykorzystuje kontrolę tłumu obecną w zestawie Twojej postaci.';
  if(!noRegen&&t.includes('sustain')&&has('regen','sustain','selfheal'))return 'Wspiera dłuższe walki i odnawianie zdrowia.';
  if(!noUltimate&&has('ultimate'))return null; // No evidence about this champion's dependence on R.
  return null;
}
module.exports={compareAugments,selectedAugmentGrades,gradeFor};
