const { itemAvailable, itemsCompatible, purchaseItem, redundantSpellblade } = require('./itemrules');
const { baseBoots, isBootItem, SUPPORT_ITEMS } = require('./rolequests');
const engine = require('./engine');

function planItems(build) {
  const items = [...build.items];
  const questBoots = build.inventory.bootsSlot === 'quest';
  if (build.inventory.bootsSlot !== 'none' && build.boots?.id) items.splice(1,0,build.boots);
  return items.map(({id,name}) => ({id,name,side:questBoots && id===build.boots.id}));
}

function purchaseRestriction(id,build,game) {
  const item = game.items.get(id);
  if (purchaseItem(id) !== id) return `To automatyczna przemiana. Bazowy zakup to ${game.items.get(purchaseItem(id))?.name || purchaseItem(id)}.`;
  if (baseBoots(id) !== id) return `Te buty wymagają ulepszenia. Ich baza to ${game.items.get(baseBoots(id))?.name || baseBoots(id)}.`;
  if (item.requiredChampion && item.requiredChampion !== build.alias) return `Przedmiot jest przeznaczony dla postaci ${item.requiredChampion}.`;
  if (item.requiredAlly || item.requiredBuffCurrencyName) return 'Ten przedmiot wymaga specjalnego odblokowania w grze.';
  if (!itemAvailable(id,game,build.mode,build.alias)) return 'Katalog gry wyklucza bezpośredni zakup tego przedmiotu w tym trybie.';
  if (SUPPORT_ITEMS.has(id)) return 'Przedmiot zadania wsparcia ma osobne zasady ekwipunku.';
  if (item.categories?.some(c=>['Consumable','Trinket','Lane'].includes(c))) return 'Ten zakup należy do wyposażenia pomocniczego lub startowego.';
  // Shop components legitimately appear in intermediate purchases, but this tool
  // compares finished builds. Some legendary items have automatic upgrades.
  if (item.to?.some(next=>itemAvailable(next,game,build.mode,build.alias)) && !isBootItem(id,game) && item.priceTotal < 1800)
    return 'To składnik receptury. Kolejność buildu pokazuje zakupy docelowe.';
  if (isBootItem(id,game) && [1001,2422].includes(id)) return 'To podstawowe buty. W docelowej kolejności planowane jest ich ulepszenie.';
  if (build.mayhem?.skipped?.includes(id)) return 'Ten przedmiot został pominięty na ten mecz.';
  if (build.inspection.excluded) return 'Reguły bieżącej kombinacji Mayhem wykluczają ten zakup z planu.';
  return '';
}

function trialPurchase(id,state,build,game,data) {
  const boot = isBootItem(id,game);
  const pinned = build.items.filter(i=>i.pinned && !i.owned).map(i=>({slot:i.slot,id:i.id}));
  const choices = {...state.choices,items:pinned,boots:build.boots?.pinned ? build.boots.id : null};
  if (boot) {
    if (build.boots?.pinned || build.boots?.owned || build.inventory.bootsSlot === 'none')
      return {blocked:'Obecny slot butów jest przypięty, zajęty lub zamknięty.'};
    choices.boots=id;
  } else {
    const conflicts = build.items.filter(i=>!itemsCompatible(id,[i.id]) || redundantSpellblade(id,[i.id]));
    const locked = conflicts.find(i=>i.pinned || i.owned);
    if (locked) return {blocked:`Kolizja z zachowanym zakupem ${locked.name}.`};
    const openSlot = Array.from({length:build.inventory.itemSlots},(_,i)=>i).find(i=>!build.items.some(item=>item.slot===i));
    const slot = conflicts[0]?.slot ?? openSlot ?? build.items.filter(i=>!i.owned&&!i.pinned).at(-1)?.slot;
    if (slot == null) return {blocked:'Każdy slot jest zajęty przez posiadany lub przypięty przedmiot.'};
    choices.items.push({slot,id});
  }
  const trial = engine.buildFor(build.alias,{...state,inspectItem:null,choices},game,data);
  const target = [...trial.items,trial.boots].find(i=>i?.id===id);
  if (!target) return {blocked:'Silnik nie umie umieścić tego zakupu w aktualnym planie.'};
  const before = planItems(build), after = planItems(trial);
  const side = boot && trial.inventory.bootsSlot === 'quest';
  const index = after.findIndex(i=>i.id===id);
  const replaced = boot ? build.boots : build.items.find(i=>i.slot===target.slot);
  return {before, after, side, slot:side ? null : index + 1, replaced:replaced?.name || null, target:target.name};
}

function explainItem(id,state,build,game,data) {
  const item = game.items.get(id), t = build.inspection, plan = planItems(build);
  const inSideSlot = build.quest?.slotItem?.id === id;
  const place = plan.findIndex(i=>i.id===id);
  const selected = place !== -1 || inSideSlot;
  const current = build.items.find(i=>i.id===id) || (build.boots?.id===id ? build.boots : null);
  const result = {id,name:item.name,selected, considered:t.ranked || t.fixed || selected,
    slot:place < 0 ? null : place+1,side:inSideSlot, reasons:[]};
  if (selected) {
    if (current) {
      if (current.owned) result.reason='Już posiadasz ten przedmiot.';
      else if (build.nextPurchase?.id===id) result.reason='To przypięty cel następnego zakupu.';
      else if (current.pinned) result.reason='Ten slot zachowuje Twój przypięty wybór.';
      else if (isBootItem(id,game)) result.reason='Wybór butów · '+current.why;
      else if (t.guardIE) result.reason='Reguła zachowuje Infinity Edge po zakupie co najmniej dwóch przedmiotów z krytem na strzelcu AD.';
      else if (t.fixed) result.reason='Silnik zarezerwował miejsce w rdzeniu buildu postaci.';
      else if (t.source==='augment') result.reason='Priorytet zwiększył augment. '+current.why;
      else if (t.source==='rule') result.reason='Reguła dopasowania do przeciwników. '+current.why;
      else if (t.popular) result.reason='Kandydat pochodzi z danych popularnych późniejszych zakupów. '+current.why;
      else if (t.core) result.reason='Kandydat z podstawowego buildu postaci. '+current.why;
      else result.reason='Kandydat z puli przedmiotów dla tego stylu. '+current.why;
    } else result.reason='To wyposażenie bocznego slotu questa roli.';
    if (t.fixed && t.why && t.why !== 'rdzeń championa') result.reasons.push(t.why);
    return result;
  }
  const restriction = purchaseRestriction(id,build,game);
  if (restriction) return {...result,reason:restriction};
  if (isBootItem(id,game)) result.reason=`Reguła butów wybrała ${build.boots?.name || 'inny wariant'} (${build.boots?.why || 'slot butów'}).`;
  else if (!t.resource) result.reason='Automatyczny dobór pomija tu ofensywne przedmioty z maną ze względu na zasób postaci.';
  else if (t.inPool && !t.damage) result.reason='Kandydat odpadł przy dopasowaniu typu obrażeń postaci do statystyk przedmiotu.';
  else if (t.inPool && !t.crit) result.reason='Filtr stylu odrzucił zakup pod kryty przy obecnym rdzeniu i augmentach.';
  else if (t.conflict) result.reason=`W planie jest ${game.items.get(t.conflict)?.name || t.conflict}. Silnik rozdziela te przedmioty ze względu na wspólną rodzinę lub efekt Spellblade.`;
  else if (!t.ranked) result.reason=t.lateStyle?'Żaden z użytych zestawów i reguł nie wprowadził tego przedmiotu do puli rankingu dla tego draftu.'
    :'Dopasowanie stylu odrzuciło ten późny zakup z danych statystycznych.';
  else if (t.lastCompetition) {
    const winner = game.items.get(t.lastCompetition.winner)?.name || t.lastCompetition.winner;
    result.reason = t.lastCompetition.tied ? `W ostatnim porównaniu oba zakupy miały taki sam wynik. Kolejność kandydatów dała miejsce ${winner}.`
      : `Przedmiot trafił do rankingu. W ostatnim porównaniu większy priorytet miał ${winner}.`;
  } else result.reason='Przedmiot trafił do puli. Dostępne miejsca zajęły rdzeń, posiadane przedmioty lub przypięcia.';
  if (t.bonus.length) result.reasons.push(...t.bonus);
  if (t.reasonRule.length) result.reasons.push(...t.reasonRule);
  result.trial=trialPurchase(id,state,build,game,data);
  return result;
}

module.exports={explainItem};
