const { itemAvailable, itemsCompatible } = require('./itemrules');
const { isBootItem } = require('./rolequests');
const catalog = require('../data/mayhem-augments.json');
const byId = new Map(catalog.augments.map(a => [a.id, a]));
const EFFECTS = {
  health: 'Skalowanie ze zdrowiem', onhit: 'Efekty on-hit / autoataki', ap: 'Skalowanie z AP', ad: 'Skalowanie z AD',
  spellcrit: 'Krytyczne umiejętności', crit: 'Skalowanie z krytami', haste: 'Częste używanie umiejętności',
  itemhaste: 'Krótsze cooldowny przedmiotów', mana: 'Skalowanie z many', healing: 'Leczenie i tarcze',
  burn: 'Obrażenia w czasie', spellblade: 'Wzmocnione ataki po umiejętności',
  adaptive:'Naturalne skalowanie postaci', spell:'Cykl podstawowych czarów', resists:'Odporności na obrażenia',
  healthhit:'Ataki skalujące się z HP', cc:'Kontrola tłumu i haste', healresists:'Leczenie skalowane odpornościami',
  sustain:'Podtrzymanie życia w walce', defensivecrit:'Krytyczna obrona', bigcrit:'Silne pojedyncze kryty',
  tickle:'On-hit po konwersji AD', healthlethality:'HP zamieniane w lethality', ultimate:'Efekty ultimate',
  itemdamage:'Obrażenia z przedmiotów', lethality:'Lethality', regen:'Regeneracja zdrowia', selfheal:'Własne leczenie',
  shield:'Przedmioty z tarczą', move:'Prędkość ruchu', slow:'Spowolnienia', stackitems:'Przedmioty na stacki', jungleitem:'Przedmioty Spirit',
};
const RULES = require('./mayhem-rules');

const ruleFor = augment => RULES[augment.api.replace(/^ARAM_/, '')];
const repeatItems = augments => new Set((augments || []).flatMap(id=>ruleFor(byId.get(Number(id)) || {api:''})?.repeat || []));
// Posiadany przedmiot może być nagrodą albo automatycznym ulepszeniem, którego nie da się kupić.
function ownedAvailable(id, game, alias = '') {
  const item=game.items.get(Number(id));
  if (!item || (item.requiredChampion && item.requiredChampion!==alias) || item.requiredAlly) return false;
  if (Array.isArray(item.maps) && item.maps.length && !item.maps.map(Number).includes(12)) return false;
  if (item.maps && !Array.isArray(item.maps) && item.maps['12']===false) return false;
  return !(item.categories || []).some(c=>['Consumable','Trinket','Lane'].includes(c))
    && (isBootItem(id,game) || item.priceTotal>=1500 || [773041,773513,773514,773515,773516].includes(Number(id)));
}
function choicesCatalog(pool = 'KIWI') {
  return { fetched: catalog.fetched, effects: EFFECTS, augments: catalog.augments.filter(a => a.pools.includes(pool)).map(a => {
    const r = ruleFor(a);
    return { ...a, effects: r?.effects || [], supported: !!r, neutral:!!r?.neutral, quest: !!r?.quest,
      summary: r?.summary || 'Brak sprawdzonej reguły zakupów. Zachowam bazowy build; opcjonalnie wskaż efekt poniżej.' };
  }) };
}
function validateSelection(input = {}, game, alias, pool = 'KIWI') {
  if (!input || typeof input !== 'object') throw Error('Nieprawidłowy wybór augmentów.');
  const ids = (values, limit, valid, message, repeats = new Set()) => {
    if (!Array.isArray(values) || values.length > limit) throw Error(message);
    const out = values.map(Number);
    if (out.some((id,i)=>!valid(id) || (!repeats.has(id) && out.indexOf(id)!==i))) throw Error(message);
    return out;
  };
  const augments = ids(input.augments || [], 5, id => byId.get(id)?.pools.includes(pool), 'Wybierz do 5 różnych augmentów z puli tego trybu.');
  if (augments.filter(id => ruleFor(byId.get(id))?.conversion).length > 1) throw Error('Nie łącz przeciwnych konwersji AP i AD.');
  const completed = ids(input.completed || [], 5, id => augments.includes(id) && ruleFor(byId.get(id))?.quest, 'Nieprawidłowe ukończone zadanie augmentu.');
  const repeats = repeatItems(augments);
  const owned = ids(input.owned || [], 5, id => {
    const i = game.items.get(id);
    return i && ownedAvailable(id, game, alias) && !isBootItem(id, game);
  }, 'Zaznacz do 5 ukończonych przedmiotów. Buty mają osobne pole.', repeats);
  if (owned.some((id,i) => !itemsCompatible(id, owned.slice(0,i),repeats))) throw Error('Posiadane przedmioty wzajemnie się wykluczają.');
  const ownedBoots = Number(input.ownedBoots) || null;
  if (ownedBoots && (!ownedAvailable(ownedBoots,game,alias) || !isBootItem(ownedBoots,game))) throw Error('Wybierz dostępne buty.');
  const effects = {};
  for (const id of augments) {
    const value = input.effects?.[id];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length > 3 || value.some(v => !Object.hasOwn(EFFECTS,v))) throw Error('Nieprawidłowy efekt augmentu.');
    effects[id] = [...new Set(value)];
  }
  return { augments, completed, owned, ownedBoots, effects };
}
function adaptation(selection, champion, context = {}) {
  const s = selection || {}, picked = (s.augments || []).map(id => byId.get(id)).filter(Boolean);
  const bonuses = new Map(), hints = [], unknown = [], excluded = new Set(), upgrades=[];
  // Korekta priorytetów nie cofa mechaniki augmentu (np. wyłączenia R czy konwersji AD).
  const conversion = picked.map(a => ruleFor(a)?.conversion).find(Boolean);
  const activeRules = picked.map(ruleFor).filter(Boolean);
  const noUltimate=activeRules.some(r=>r.noUltimate), noRegen=activeRules.some(r=>r.noRegen);
  const healthConversion=activeRules.some(r=>r.healthConversion), attackConversion=activeRules.map(r=>r.attackConversion).find(Boolean);
  const ap = conversion ? conversion === 'ap' : champion.dmg === 'ap' || champion.class === 'mage' || activeRules.some(r=>r.attackAP);
  const support = !conversion && (champion.class === 'support' || (champion.traits || []).includes('enchanter'));
  const durable = ['tank','fighter'].includes(champion.class);
  const adc=champion.class==='adc', enemy=context.enemy || {};
  const repeat = new Set(activeRules.flatMap(r=>r.repeat || []));
  activeRules.flatMap(r=>r.exclude || []).forEach(id=>excluded.add(id));
  const attackItems = ap ? [3115,3124] : durable ? [3153,3748,3091] : [3153,3124,3091];
  const defensiveItems = support ? [3190,3222] : ap && !durable ? (enemy.apShare>=0.55 ? [3102,3157] : [3157,3102])
    : durable ? (enemy.apShare>=0.55 ? [3065,4401,2504] : enemy.adShare>=0.55 ? [3143,3110,3075] : [3065,3143,2502])
      : enemy.apShare>=0.55 ? [3156,3091] : [6673,3072];
  const nativeItems = support ? [6617,3107] : ap ? [3089,4645,3135] : adc ? [3031,3036,3072] : durable ? [3071,6692,3161] : [6692,3142,6695];
  const spellItems = support ? [6617,3107,6620] : ap ? [6655,8010,4628] : adc ? [6675,3078,3004] : [3071,3161,6692];
  const add = (ids, amount, why, direct = amount >= 26) => ids.forEach((id, index) => {
    const prev = bonuses.get(id) || { score: 0, reasons: [], contributions:[] };
    bonuses.set(id, { score: Math.min(30, prev.score + amount - index * 0.25), reasons: [...prev.reasons, why],
      contributions:[...prev.contributions,{ group:why, score:amount-index*0.25, direct }] });
  });
  for (const a of picked) {
    const r = ruleFor(a), disabled = noUltimate && r?.ultimate;
    const effects = disabled ? [] : s.effects?.[a.id] ?? r?.effects ?? [];
    if (!r && !effects.length) unknown.push(a.name);
    const overridden = Object.hasOwn(s.effects || {}, a.id);
    hints.push({ id:a.id, name:a.name, english:a.english, supported:!!r || effects.length > 0, quest:!!r?.quest,
      neutral:!!r?.neutral || disabled,
      completed:(s.completed || []).includes(a.id), summary:disabled ? 'Back To Basics wyłącza ultimate, więc pomijam synergię tego augmentu z R.' : overridden ? `Ręcznie wskazany wpływ: ${effects.map(e=>EFFECTS[e]).join(', ') || 'bez dodatkowego priorytetu'}.` : r?.summary || 'Brak sprawdzonej reguły zakupów dla tego augmentu.', effects });
    const why = `augment ${a.name}`;
    for (const effect of effects) {
      if (effect === 'health') add(healthConversion ? (ap ? [] : [3814,3071,3181]) : durable ? [3084,2502,3083,3748] : support ? [3107,3190,6617] : ap ? [3116,4633] : [3071,3181], 7, why + ': zdrowie');
      if (effect === 'onhit' && !['crit','haste'].includes(attackConversion)) add(attackItems, 10, why + ': efekty on-hit');
      if (effect === 'ap') add(support ? [6617,3089] : [3089,4645,3135], 8, why + ': skalowanie AP');
      if (effect === 'ad') add(champion.class === 'adc' ? [3031,3072] : [6692,3071,6333], 7, why + ': skalowanie AD');
      if (effect === 'spellcrit') { add(ap ? [3089,4645] : [3031,6676], 8, why + ': skalowanie czarów'); add(ap ? [3031] : [3031,6676],ap ? 7 : 9,why + ': szansa i siła krytów'); }
      if (effect === 'crit' && attackConversion!=='onhit') add(ap ? [3031,3046] : [3031,3036,3046], 7, why + ': kryty');
      if (effect === 'haste') add(support ? [6617,3107] : ap ? [4628,8010,6655] : [3071,3161,6696], 9, why + ': haste');
      if (effect === 'itemhaste') add(support ? [3107,3190,3222] : ap ? [3157,3102,3152] : durable ? [2502,6610,3190] : [3153,3026], 10, why + ': cooldowny przedmiotów');
      if (effect === 'mana') add(ap ? [3003,6657,3118] : durable ? [3110,3004] : [3004,3508], 10, why + ': mana');
      if (effect === 'healing') add(support ? [6617,3107,3504,6620] : [3065], 8, why + ': leczenie i tarcze');
      if (effect === 'burn') add(ap ? [6653,2503] : durable ? [3068,6664] : [], 7, why + ': obrażenia w czasie');
      if (effect === 'spellblade') add(ap ? [3100] : [3078,6662], 12, why + ': Spellblade');
      if (effect === 'adaptive') add(nativeItems,5,why + ': skalowanie championa');
      if (effect === 'spell' || effect === 'cc') add(spellItems,7,why + ': cykl umiejętności');
      if (effect === 'resists') add(defensiveItems,7,why + ': efektywna wytrzymałość');
      if (effect === 'healthhit' && !healthConversion) add(durable ? [3748,3084] : [3748,3153],8,why + ': ataki od HP');
      if (effect === 'healresists') add(support ? [3190,3222,3107] : durable ? [3065,3190,2502] : [3102,3157],10,why + ': odporności wzmacniające leczenie');
      if (effect === 'sustain') add(support ? [6617,3107] : ap ? [4633] : durable ? [6610,6333,3065] : [3072,3153],7,why + ': podtrzymanie życia');
      if (effect === 'defensivecrit') { add(defensiveItems,6,why + ': obrona');add(durable ? [6673,3046] : [3031,6673],7,why + ': krytyczna obrona'); }
      if (effect === 'bigcrit') add([3031,6676,3072],12,why + ': pojedyncze kryty');
      if (effect === 'tickle') add([3115,3124,3091,3302],13,why + ': on-hit po konwersji');
      if (effect === 'healthlethality' && !ap) add([3814,3071,3181],10,why + ': HP jako lethality');
      if (effect === 'ultimate' && !noUltimate) add(support ? [3107,6617] : ap ? [3118] : durable ? [3161,6696] : [6696],10,why + ': ultimate');
      if (effect === 'itemdamage') add(ap ? [6653,2503,3100] : durable ? [3068,3748,2502] : [3153,3124],10,why + ': obrażenia przedmiotów');
      if (effect === 'lethality' && !ap) add([6692,3814,3142],10,why + ': lethality');
      if (effect === 'regen' && !noRegen && !healthConversion) add(durable ? [3083,3065] : support ? [6617,3107] : ap ? [4633] : [3072],8,why + ': odnawianie HP');
      if (effect === 'selfheal' && durable) add([3065],8,why + ': własne leczenie');
      if (effect === 'shield') add(support ? [3190,3003] : ap ? [3003,3102] : durable ? [3053,3156,3190] : [6673,3156],8,why + ': osłona');
      if (effect === 'move') add(support ? [2065,3504] : ap ? [4629,3100] : durable ? [3742,4401] : [3046,6672,3142],9,why + ': ruch');
      if (effect === 'slow') add(ap ? [3116] : durable ? [6662,6631] : [6631],10,why + ': wzmocnione spowolnienia');
      if (effect === 'stackitems') add(ap ? [773041] : durable ? [773138,773141] : [773141],18,why + ': skalowanie stacków');
      if (effect === 'jungleitem') add(ap ? [773206] : durable ? [773207] : [773209],26,why + ': ulepszony przedmiot Spirit');
    }
    if (r?.consumed && (s.completed || []).includes(a.id)) r.items.forEach(id => excluded.add(id));
    const upgradeFrom = !overridden && r?.replace?.find(id=>(s.owned || []).includes(id));
    if (upgradeFrom) { upgrades.push({ from:upgradeFrom, to:r.items[0] });excluded.add(r.items[0]); }
    if (r?.items && !overridden && !(s.completed || []).includes(a.id)) {
      const ids = r.anyItem && (s.owned || []).some(id => r.items.includes(id)) ? [] : r.items;
      add(ids, 26, why + (r.quest ? ': przedmiot do zadania' : ': ulepszony przedmiot'), !r.anyItem && !r.repeat);
    }
  }
  return { bonuses, hints, unknown, excluded, conversion, repeat, upgrades, freeBoots:activeRules.some(r=>r.freeBoots), active: bonuses.size > 0, owned:s.owned || [], ownedBoots:s.ownedBoots || null };
}
class MayhemSession {
  constructor(value = null, save = () => {}) { this.value = value; this.save = save; }
  ensure(gameId, alias, pool = 'KIWI') {
    const key = `${gameId}:${alias}:${pool}`;
    if (this.value?.key !== key) {
      const next = { key, gameId, alias, pool, selection: { augments:[], completed:[], owned:[], ownedBoots:null, effects:{} } };
      this.save(next); this.value = next;
    }
    return this.value;
  }
  set(key, selection) {
    if (!key || this.value?.key !== key) throw Error('Mecz się zmienił. Otwórz augmenty ponownie.');
    const next = { ...this.value, selection:JSON.parse(JSON.stringify(selection)) }; this.save(next); this.value = next;
    return next;
  }
  setInventory(key, inventory) {
    if (!key || this.value?.key !== key) return false;
    if (JSON.stringify(this.value.inventory) === JSON.stringify(inventory)) return false;
    const next = { ...this.value, inventory };
    this.save(next); this.value = next; return true;
  }
  setAutoInventory(key, enabled) {
    if (!key || this.value?.key !== key) throw Error('Mecz się zmienił. Otwórz ekwipunek ponownie.');
    const next = { ...this.value, autoInventory:enabled };
    this.save(next); this.value = next;
  }
}
function effectiveSelection(session) {
  if (session.autoInventory === false || !session.inventory) return session.selection;
  return { ...session.selection, owned:session.inventory.owned, ownedBoots:session.inventory.ownedBoots };
}
module.exports = { choicesCatalog, validateSelection, adaptation, MayhemSession, effectiveSelection, EFFECTS, ownedAvailable, repeatItems };
