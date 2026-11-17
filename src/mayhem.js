const { itemAvailable, itemsCompatible } = require('./itemrules');
const { isBootItem } = require('./rolequests');
const catalog = require('../data/mayhem-augments.json');
const byId = new Map(catalog.augments.map(a => [a.id, a]));
const { buildProfile } = require('./mayhem-profile');
const EFFECTS = {
  health: 'Skalowanie ze zdrowiem', onhit: 'Efekty on-hit / autoataki', attacks: 'Premie do zwykłych ataków', ap: 'Skalowanie z AP', ad: 'Skalowanie z AD',
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
const headliners = require('./headliners');

const ruleFor = augment => RULES[augment.api.replace(/^ARAM_/, '')];
function upgradeTargets(rule,champion,selection={},enemy={}){
  if(!rule?.upgrade)return [];
  if(!rule.spellbladeUpgrade){
    const targets=rule.items||[],owned=targets.filter(id=>selection.owned?.includes(id));
    if(!rule.anyItem)return targets;
    return owned.length?owned:[targets.includes(6664)&&enemy.apShare>=.55?6664:targets[0]].filter(Boolean);
  }
  const owned=(selection.owned||[]).filter(id=>[3100,3078,6662].includes(id));
  if(owned.length)return owned;
  const conversion=(selection.augments||[]).map(id=>byId.get(id)).filter(Boolean).map(ruleFor).find(r=>r?.conversion)?.conversion;
  return conversion==='ap'?[3100]:conversion==='ad'?[3078]:champion.class==='tank'?[6662]
    :champion.dmg==='ap'||champion.class==='mage'?[3100]:[3078];
}
const repeatItems = augments => new Set((augments || []).flatMap(id=>ruleFor(byId.get(Number(id)) || {api:''})?.repeat || []));
// Posiadany przedmiot może być nagrodą albo automatycznym ulepszeniem, którego nie da się kupić.
function ownedAvailable(id, game, alias = '', mode = 'mayhem') {
  const item=game.items.get(Number(id));
  if (!item || (item.requiredChampion && item.requiredChampion!==alias) || item.requiredAlly) return false;
  const map = ['aram','mayhem'].includes(mode) ? 12 : 11;
  if (Array.isArray(item.maps) && item.maps.length && !item.maps.map(Number).includes(map)) return false;
  if (item.maps && !Array.isArray(item.maps) && item.maps[String(map)]===false) return false;
  return !(item.categories || []).some(c=>['Consumable','Trinket','Lane'].includes(c))
    && (isBootItem(id,game) || item.priceTotal>=1500 || [773041,773513,773514,773515,773516].includes(Number(id)));
}
function choicesCatalog(pool = 'KIWI') {
  return { fetched: catalog.fetched, effects: EFFECTS, headliners:headliners.catalog, maxAugments:headliners.MAX_AUGMENTS, augments: catalog.augments.filter(a => a.pools.includes(pool)).map(a => {
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
  const augments = ids(input.augments || [], headliners.MAX_AUGMENTS, id => byId.get(id)?.pools.includes(pool), 'Nieprawidłowy zestaw augmentów z puli tego trybu.');
  if (augments.filter(id => ruleFor(byId.get(id))?.conversion).length > 1) throw Error('Nie łącz przeciwnych konwersji AP i AD.');
  const completed = ids(input.completed || [], headliners.MAX_AUGMENTS, id => augments.includes(id) && ruleFor(byId.get(id))?.quest, 'Nieprawidłowe ukończone zadanie augmentu.');
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
  const headliner=headliners.validateHeadliner(input.headliner);
  return { augments, completed, owned, ownedBoots, effects, ...(headliner?{headliner}:{}) };
}
function adaptation(selection, champion, context = {}) {
  const s = selection || {}, picked = (s.augments || []).map(id => byId.get(id)).filter(Boolean);
  const bonuses = new Map(), hints = [], unknown = [], excluded = new Set(), upgrades=[];
  // Korekta priorytetów nie cofa mechaniki augmentu (np. wyłączenia R czy konwersji AD).
  const conversion = picked.map(a => ruleFor(a)?.conversion).find(Boolean);
  const activeRules = picked.map(ruleFor).filter(Boolean);
  const noUltimate=activeRules.some(r=>r.noUltimate), noRegen=activeRules.some(r=>r.noRegen);
  const healthConversion=activeRules.some(r=>r.healthConversion), attackConversion=activeRules.map(r=>r.attackConversion).find(Boolean);
  const attackAP = activeRules.some(r=>r.attackAP), manaConversion = activeRules.some(r=>r.manaConversion);
  const {ap,support,durable,tank,adc,attacks,usesMana} = buildProfile(champion,{conversion,attackAP,owned:s.owned});
  const critFit = !tank && !support && (!ap && attacks || activeRules.some(r=>r.effects.includes('spellcrit')));
  const enemy=context.enemy || {};
  const repeat = new Set(activeRules.flatMap(r=>r.repeat || []));
  activeRules.flatMap(r=>r.exclude || []).forEach(id=>excluded.add(id));
  const attackItems = ap ? [3115,3124] : durable ? [3153,3748,3091] : [3153,3124,3091];
  const defensiveItems = support ? [3190,3222] : ap && !durable ? (enemy.apShare>=0.55 ? [3102,3157] : [3157,3102])
    : durable ? (enemy.apShare>=0.55 ? [3065,4401,2504] : enemy.adShare>=0.55 ? [3143,3110,3075] : [3065,3143,2502])
      : enemy.apShare>=0.55 ? [3156,3091] : [6673,3072];
  const baseItems = champion.items || context.core;
  const nativeItems = !conversion && !attackConversion && !attackAP && baseItems?.length
    ? baseItems : support ? [6617,3107] : tank ? [3068,2502,3065] : ap ? [3089,4645,3135] : adc ? [3031,3036,3072] : durable ? [3071,6692,3161] : [6692,3142,3814];
  const tankHaste = enemy.apShare>=.55 ? [3065,2504,3190] : [2502,3110,3190];
  const spellItems = support ? [6617,3107,6620] : tank ? tankHaste : ap ? [4628,8010,6655] : adc ? [6675,3508,3004] : [3071,3161,6692];
  const healthItems = support ? [3107,3190,6617] : tank || durable && !ap ? [3084,2502,3083,3748] : ap ? [4633,3116] : [3071,3181];
  // Resource data is explicit: an unknown/new champion is not guessed to be manaless.
  // Frozen Heart may still be a defensive answer; offensive mana purchases need a
  // resource, a mana conversion, or a direct quest/upgrade chosen by the player.
  const required = new Set([...activeRules.flatMap(r=>r.items || []),...(context.pinned || [])]);
  if (usesMana === false && !manaConversion) {
    for (const item of context.game?.items.values() || []) {
      if (item.categories?.includes('Mana') && item.categories.some(c=>['SpellDamage','Damage'].includes(c)) && !required.has(item.id)) excluded.add(item.id);
    }
  }
  let family;
  const add = (ids, amount, why, direct = amount >= 26) => ids.filter(id=>!excluded.has(id)).forEach((id, index) => {
    const prev = bonuses.get(id) || { score: 0, reasons: [], contributions:[] };
    bonuses.set(id, { score: Math.min(30, prev.score + amount - index * 0.25), reasons: [...prev.reasons, why],
      contributions:[...prev.contributions,{ group:why, family:family || why, score:amount-index*0.25, direct }] });
  });
  for (const a of picked) {
    const r = ruleFor(a), disabled = noUltimate && r?.ultimate;
    const effects = disabled ? [] : s.effects?.[a.id] ?? r?.effects ?? [];
    if (!r && !effects.length) unknown.push(a.name);
    const overridden = Object.hasOwn(s.effects || {}, a.id);
    hints.push({ id:a.id, name:a.name, english:a.english, supported:!!r || effects.length > 0, quest:!!r?.quest,
      neutral:!!r?.neutral || disabled,
      completed:(s.completed || []).includes(a.id), itemTargets:overridden?[]:upgradeTargets(r,champion,s,enemy),oneItem:!!r?.anyItem,
      summary:disabled ? 'Back To Basics wyłącza ultimate, więc pomijam synergię tego augmentu z R.' : overridden ? `Ręcznie wskazany wpływ: ${effects.map(e=>EFFECTS[e]).join(', ') || 'bez dodatkowego priorytetu'}.` : r?.summary || 'Brak sprawdzonej reguły zakupów dla tego augmentu.', effects });
    const why = `augment ${a.name}`;
    for (const effect of effects) {
      family = ['attacks','onhit'].includes(effect) ? 'attacks' : ['cc','spell','haste'].includes(effect) ? 'spell' : effect;
      const natural = () => add(nativeItems,5,why + ': skalowanie championa');
      const forcedAttack = overridden || r?.abilityOnHit || attackAP;
      if (effect === 'health' && !(r?.manaHealth && (usesMana===false || manaConversion))) add(healthConversion ? (ap ? [] : [3814,3071,3181]) : healthItems, 7, why + ': zdrowie');
      if (effect === 'attacks' || effect === 'onhit') {
        if (!['crit','haste'].includes(attackConversion) && (attacks || forcedAttack)) add(attackItems,10,why + ': efekty ataków');
        else natural();
      }
      if (effect === 'ap' && (ap && !tank || overridden)) add(support ? [6617,3089] : [3089,4645,3135],8,why + ': skalowanie AP');
      if (effect === 'ad' && (!ap && !tank && !support || overridden)) add(adc ? [3031,3072] : [6692,3071,6333],7,why + ': skalowanie AD');
      if (effect === 'spellcrit') {
        if(tank || support) natural();
        else { add(ap ? [3089,4645] : [3031,6676],8,why + ': skalowanie czarów'); add(ap ? [3031] : [3031,6676],ap ? 7 : 9,why + ': szansa i siła krytów'); }
      }
      if (effect === 'crit' && attackConversion!=='onhit' && (critFit || overridden)) add(ap ? [3031] : [3031,3036,3046],7,why + ': kryty');
      if (effect === 'haste') add(spellItems, 9, why + ': haste');
      if (effect === 'itemhaste') add(support ? [3107,3190,3222] : tank ? [2502,3190] : ap ? [3157,3102,3152] : durable ? [6610,2502] : adc ? [6673,3026] : [6692,3814,3026], 10, why + ': cooldowny przedmiotów');
      if (effect === 'mana') {
        if((usesMana !== false || manaConversion) && (!manaConversion || ap || tank || support)) add(support ? [3003,6617] : tank ? [3110] : ap ? [3003,6657,3118] : [3004,3508],10,why + ': mana');
      }
      if (effect === 'healing') { if(support) add([6617,3107,3504,6620],8,why + ': leczenie i tarcze'); else if(durable && (champion.traits||[]).includes('heal')) add([3065],8,why + ': własne leczenie'); else natural(); }
      if (effect === 'burn') add(tank ? [3068,6664] : ap ? [6653,2503] : durable ? [3068,6664] : [], 7, why + ': obrażenia w czasie');
      if (effect === 'spellblade') {
        if(tank) add([6662],12,why + ': Spellblade z pancerzem');
        else if(!support && (ap || attacks) || overridden) add(ap ? [3100] : [3078],12,why + ': Spellblade');
        else natural();
      }
      if (effect === 'adaptive') add(nativeItems,5,why + ': skalowanie championa');
      if (effect === 'spell' || effect === 'cc') add(spellItems,7,why + ': cykl umiejętności');
      if (effect === 'resists') add(defensiveItems,7,why + ': efektywna wytrzymałość');
      if (effect === 'healthhit' && !healthConversion) add(tank || durable && !ap ? [3748,3084] : ap || support ? healthItems : [3748,3153],8,why + ': ataki od HP');
      if (effect === 'healresists') { if(support || durable || (champion.traits||[]).includes('heal')) add(support ? [3190,3222] : durable ? [3065,3190,2502] : [3102,3157],10,why + ': odporności wzmacniające leczenie'); else natural(); }
      if (effect === 'sustain') add(support ? [6617,3107] : tank ? [3065,2502] : ap ? [4633] : durable ? [6610,6333,3065] : adc ? [3072,3153] : [6692,6333],7,why + ': podtrzymanie życia');
      if (effect === 'defensivecrit') { add(defensiveItems,6,why + ': obrona'); if(attacks && !ap) add([3031,6673],7,why + ': krytyczna obrona'); }
      if (effect === 'bigcrit' && (!ap && attacks || overridden)) add([3031,6676,3072],12,why + ': pojedyncze kryty');
      if (effect === 'tickle') add([3115,3124,3091,3302],13,why + ': on-hit po konwersji');
      if (effect === 'healthlethality' && !ap) add([3814,3071,3181],10,why + ': HP jako lethality');
      if (effect === 'ultimate' && !noUltimate) add(support ? [3107,6617] : tank ? tankHaste : ap ? (usesMana===false && !manaConversion ? [4628,8010] : [3118]) : durable ? [3161,6696] : [6696],10,why + ': ultimate');
      if (effect === 'itemdamage') add(support ? [6620] : tank ? [3068,2502] : ap ? [6653,2503,3100] : durable ? [3748,6692] : attacks ? [3153,3124] : [6692,6698],10,why + ': obrażenia przedmiotów');
      if (effect === 'lethality' && !ap) add([6692,3814,3142],10,why + ': lethality');
      if (effect === 'regen' && !noRegen && !healthConversion) add(support ? [6617,3107] : tank || durable && !ap ? [3083,3065] : ap ? [4633] : [3072],8,why + ': odnawianie HP');
      if (effect === 'selfheal' && durable) add([3065],8,why + ': własne leczenie');
      if (effect === 'shield') add(support ? [3190,3003] : tank ? [3190] : ap ? [3003] : durable ? [3053,3156] : [6673,3156,6692],8,why + ': osłona');
      if (effect === 'move') add(support ? [2065,3504] : tank ? [3742,4401] : ap ? [4629,3100] : durable ? [3742,4401] : adc ? [3046,6672] : [3142],9,why + ': ruch');
      if (effect === 'slow') add(tank ? [6662] : ap ? [3116] : durable ? [6631] : [],10,why + ': wzmocnione spowolnienia');
      if (effect === 'stackitems') add(tank ? [773138] : ap ? [773041] : [773141],18,why + ': skalowanie stacków');
      if (effect === 'jungleitem') add(tank ? [773207] : ap ? [773206] : [773209],26,why + ': ulepszony przedmiot Spirit');
    }
    family = null;
    if (r?.consumed && (s.completed || []).includes(a.id)) r.items.forEach(id => excluded.add(id));
    const upgradeFrom = !overridden && r?.replace?.find(id=>(s.owned || []).includes(id));
    if (upgradeFrom) { upgrades.push({ from:upgradeFrom, to:r.items[0] });excluded.add(r.items[0]); }
    if ((r?.items||r?.spellbladeUpgrade) && !overridden && !(s.completed || []).includes(a.id)) {
      const targets=r.upgrade?upgradeTargets(r,champion,s,enemy):r.items;
      const ids = r.anyItem && (s.owned || []).some(id => targets.includes(id)) ? [] : targets;
      add(ids, 26, why + (r.quest ? ': przedmiot do zadania' : ': ulepszony przedmiot'), !r.anyItem && !r.repeat);
    }
  }
  return { bonuses, hints, unknown, excluded, conversion, repeat, upgrades,
    transformsBuild:!!(conversion || attackConversion && (attackConversion!=='crit' || attacks && !ap) || healthConversion || attackAP || manaConversion && ap && !tank && !support),
    freeBoots:activeRules.some(r=>r.freeBoots), active: bonuses.size > 0, owned:s.owned || [], ownedBoots:s.ownedBoots || null };
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
  patch(key, changes) {
    if(!key || this.value?.key!==key)throw Error('Mecz się zmienił. Otwórz augmenty ponownie.');
    const next={...this.value,...changes};this.save(next);this.value=next;return next;
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
module.exports = { choicesCatalog, validateSelection, adaptation, upgradeTargets, MayhemSession, effectiveSelection, EFFECTS, ownedAvailable, repeatItems };
