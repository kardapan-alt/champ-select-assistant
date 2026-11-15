const { itemAvailable, itemsCompatible } = require('./itemrules');
const { isBootItem } = require('./rolequests');
const catalog = require('../data/mayhem-augments.json');
const byId = new Map(catalog.augments.map(a => [a.id, a]));
const EFFECTS = {
  health: 'Skalowanie ze zdrowiem', onhit: 'Efekty on-hit / autoataki', ap: 'Skalowanie z AP', ad: 'Skalowanie z AD',
  spellcrit: 'Krytyczne umiejętności', crit: 'Skalowanie z krytami', haste: 'Częste używanie umiejętności',
  itemhaste: 'Krótsze cooldowny przedmiotów', mana: 'Skalowanie z many', healing: 'Leczenie i tarcze',
  burn: 'Obrażenia w czasie', spellblade: 'Wzmocnione ataki po umiejętności',
};
const RULES = {};
const rule = (names, effects, summary, extra = {}) => names.split('|').forEach(name => { RULES[name] = { effects, summary, ...extra }; });
rule('Goliath|CelestialBody|TankEngine|MountainSoul', ['health'], 'Więcej wartości ze zdrowia i przedmiotów, które z niego skalują.');
rule('HeavyHitter', ['health','onhit'], 'Autoataki wykorzystują maksymalne zdrowie: łącz HP z efektami on-hit.');
rule('Deft|Firebrand|DualWield|MysticPunch|TapDancer|ScopedWeapons|ScopierWeapons|ScopiestWeapons|Twinfire', ['onhit'], 'Wzmocnione autoataki zwiększają wartość odpowiednich efektów on-hit.');
rule('EtherealWeapon', ['onhit'], 'Umiejętności nakładają on-hit: uwzględnij te efekty także w buildzie AP.');
rule('Marksmage', ['ap','onhit'], 'AP wzmacnia autoataki: połącz moc umiejętności z szybkością ataku.');
rule('MasterofDuality', ['onhit','haste'], 'Przeplataj ataki i umiejętności, żeby korzystać z obu premii.');
rule('WitchfulThinking|PhenomenalEvil|Eureka|BigBrain|LichBrain', ['ap'], 'Większe skalowanie AP podnosi wartość przedmiotów z mocą umiejętności.');
rule('BluntForce', ['ad'], 'Premia do AD sprzyja zakupom wzmacniającym obrażenia fizyczne.');
rule('ADAPt', ['ap'], 'AD zamienia się w AP. Dalsze zakupy przechodzą na moc umiejętności.', { conversion: 'ap' });
rule('escAPADe', ['ad'], 'AP zamienia się w AD. Dalsze zakupy przechodzą na obrażenia od ataku.', { conversion: 'ad' });
rule('JeweledGauntlet|JeweledBracelet', ['spellcrit'], 'Umiejętności mogą trafiać krytycznie. Zachowaj właściwe dla postaci skalowanie AP lub AD.');
rule('ItsCritical|SoulSiphon|CriticalRhythm', ['crit'], 'Kryty zwiększają wartość przedmiotów wzmacniających trafienia krytyczne.');
rule('Vulnerability', ['burn','spellcrit'], 'Kryty dotyczą efektów przedmiotów i obrażeń w czasie; build nadal uwzględnia typ obrażeń postaci.');
rule('Recursion|BreadAndButter|BreadAndCheese|BreadAndJam|Archmage|InfiniteRecursion|UltimateRecursion|SpecializedRecursion', ['haste'], 'Zachowaj obrażenia i zasoby potrzebne do częstego rzucania umiejętności.');
rule('ApexInventor', ['itemhaste'], 'Premiuj przedmioty z użytecznym aktywem lub efektem z czasem odnowienia.');
rule('MindtoMatter', ['mana','health'], 'Mana zwiększa zdrowie; zakupy z maną mogą realizować oba cele.');
rule('Overflow', ['mana'], 'Większa pula many wspiera wzmocnione umiejętności i ich większy koszt.');
rule('NoManaNoProblem', ['mana','ap'], 'Mana z przedmiotów wspiera AP dzięki konwersji augmentu.');
rule('AllForYou|FirstAidKit|CriticalHealing|SonicBoom|WindspeakersBlessing|SpiritBomb|SearingDawn', ['healing'], 'Wzmacniaj leczenie i tarcze, zachowując przedmioty wsparcia.');
rule('InfernalConduit', ['burn','haste'], 'Wykorzystuj częste trafienia i obrażenia w czasie. Efekty przedmiotów nie muszą uruchamiać każdego efektu augmentu.');
rule('Upgrade_Sheen', ['spellblade'], 'Augment wzmacnia Spellblade; dobierz jego wersję do skalowania postaci.');
for (const [name, items] of Object.entries({ Upgrade_Collector:[6676], Upgrade_IE:[3031], Upgrade_Immolate:[3068,6664],
  Upgrade_ZH:[3157], Upgrade_SunderedSky:[6610], Upgrade_Ravenous:[3074], Upgrade_DeathDance:[6333],
  Upgrade_Stormsurge:[4646], Upgrade_SwordOfBlossom:[124011] })) {
  rule(name, [], 'Przyspiesz zakup przedmiotu bezpośrednio ulepszanego przez ten augment.', { items, anyItem: name === 'Upgrade_Immolate' });
}
rule('Quest_SteelYourHeart', ['health'], 'Zadanie wymaga Heartsteel. Po zdobyciu wymaganych ładunków zaznacz ukończenie.', { items:[3084], quest:true });
rule('Quest_WoogletsWitchcap', ['ap'], 'Zadanie wymaga Rabadona i Zhonyi. Po połączeniu oznacz zadanie jako ukończone i dodaj nagrodę do posiadanych.', { items:[3089,3157], quest:true, consumed:true });
rule('Quest_VoidImmolation', ['health'], 'Zadanie wymaga Sunfire Aegis i Hollow Radiance. Po połączeniu oznacz ukończenie i posiadany przedmiot nagrody.', { items:[3068,6664], quest:true, consumed:true });
rule('Quest_UltraHydra', ['ad'], 'Zadanie wymaga trzech Hydr. Po połączeniu oznacz ukończenie i posiadaną nagrodę.', { items:[3074,6698,3748], quest:true, consumed:true });

const ruleFor = augment => RULES[augment.api.replace(/^ARAM_/, '')];
function choicesCatalog(pool = 'KIWI') {
  return { fetched: catalog.fetched, effects: EFFECTS, augments: catalog.augments.filter(a => a.pools.includes(pool)).map(a => {
    const r = ruleFor(a);
    return { ...a, effects: r?.effects || [], supported: !!r, quest: !!r?.quest,
      summary: r?.summary || 'Brak sprawdzonej reguły zakupów. Zachowam bazowy build; opcjonalnie wskaż efekt poniżej.' };
  }) };
}
function validateSelection(input = {}, game, alias, pool = 'KIWI') {
  if (!input || typeof input !== 'object') throw Error('Nieprawidłowy wybór augmentów.');
  const ids = (values, limit, valid, message) => {
    if (!Array.isArray(values) || values.length > limit) throw Error(message);
    const out = values.map(Number);
    if (new Set(out).size !== out.length || out.some(id => !valid(id))) throw Error(message);
    return out;
  };
  const augments = ids(input.augments || [], 5, id => byId.get(id)?.pools.includes(pool), 'Wybierz do 5 różnych augmentów z puli tego trybu.');
  if (augments.filter(id => ruleFor(byId.get(id))?.conversion).length > 1) throw Error('Nie łącz przeciwnych konwersji AP i AD.');
  const completed = ids(input.completed || [], 5, id => augments.includes(id) && ruleFor(byId.get(id))?.quest, 'Nieprawidłowe ukończone zadanie augmentu.');
  const owned = ids(input.owned || [], 5, id => {
    const i = game.items.get(id);
    return i && itemAvailable(id, game, 'mayhem', alias) && !isBootItem(id, game)
      && i.priceTotal >= 1500 && !(i.categories || []).some(c => ['Consumable','Trinket'].includes(c));
  }, 'Zaznacz do 5 ukończonych przedmiotów. Buty mają osobne pole.');
  if (owned.some((id,i) => !itemsCompatible(id, owned.slice(0,i)))) throw Error('Posiadane przedmioty wzajemnie się wykluczają.');
  const ownedBoots = Number(input.ownedBoots) || null;
  if (ownedBoots && (!itemAvailable(ownedBoots,game,'mayhem',alias) || !isBootItem(ownedBoots,game))) throw Error('Wybierz dostępne buty.');
  const effects = {};
  for (const id of augments) {
    const value = input.effects?.[id];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length > 3 || value.some(v => !Object.hasOwn(EFFECTS,v))) throw Error('Nieprawidłowy efekt augmentu.');
    effects[id] = [...new Set(value)];
  }
  return { augments, completed, owned, ownedBoots, effects };
}
function adaptation(selection, champion) {
  const s = selection || {}, picked = (s.augments || []).map(id => byId.get(id)).filter(Boolean);
  const bonuses = new Map(), hints = [], unknown = [], excluded = new Set();
  const conversion = picked.filter(a => !Object.hasOwn(s.effects || {}, a.id)).map(a => ruleFor(a)?.conversion).find(Boolean);
  const ap = conversion ? conversion === 'ap' : champion.dmg === 'ap' || champion.class === 'mage';
  const support = !conversion && (champion.class === 'support' || (champion.traits || []).includes('enchanter'));
  const durable = ['tank','fighter'].includes(champion.class);
  const add = (ids, amount, why) => ids.forEach((id, index) => {
    const prev = bonuses.get(id) || { score: 0, reasons: [], contributions:[] };
    bonuses.set(id, { score: Math.min(30, prev.score + amount - index * 0.25), reasons: [...prev.reasons, why],
      contributions:[...prev.contributions,{ group:why, score:amount-index*0.25, direct:amount>=26 }] });
  });
  for (const a of picked) {
    const r = ruleFor(a), effects = s.effects?.[a.id] ?? r?.effects ?? [];
    if (!r && !effects.length) unknown.push(a.name);
    const overridden = Object.hasOwn(s.effects || {}, a.id);
    hints.push({ id:a.id, name:a.name, english:a.english, supported:!!r || effects.length > 0, quest:!!r?.quest,
      completed:(s.completed || []).includes(a.id), summary:overridden ? `Ręcznie wskazany wpływ: ${effects.map(e=>EFFECTS[e]).join(', ') || 'bez dodatkowego priorytetu'}.` : r?.summary || 'Brak sprawdzonej reguły zakupów dla tego augmentu.', effects });
    const why = `augment ${a.name}`;
    for (const effect of effects) {
      if (effect === 'health') add(durable ? [3084,2502,3083,3748] : ap ? [3116,4633] : [3071,3181], 7, why + ': zdrowie');
      if (effect === 'onhit') add(ap ? [3115,3124] : [3153,3124,3091], 10, why + ': efekty on-hit');
      if (effect === 'ap') add(support ? [6617,3089] : [3089,4645,3135], 8, why + ': skalowanie AP');
      if (effect === 'ad') add(champion.class === 'adc' ? [3031,3072] : [6692,3071,6333], 7, why + ': skalowanie AD');
      if (effect === 'spellcrit') add(ap ? [3089,4645] : [3031,6676], 9, why + ': kryty i właściwe skalowanie obrażeń');
      if (effect === 'crit') add(ap ? [3089] : [3031,3036,3046], 7, why + ': kryty');
      if (effect === 'haste') add(support ? [6617,3107] : ap ? [3118,4645,3089] : [3071,3161], 5, why + ': częste umiejętności');
      if (effect === 'itemhaste') add(support ? [3107,3190,3222] : ap ? [3157,3102,3152] : durable ? [2502,6610,3190] : [3153,3026], 10, why + ': cooldowny przedmiotów');
      if (effect === 'mana') add(ap ? [3003,3118,6657] : [3110,3042], 10, why + ': mana');
      if (effect === 'healing') add(support ? [6617,3107,3504,6620] : [3065], 8, why + ': leczenie i tarcze');
      if (effect === 'burn') add(ap ? [6653,2503] : durable ? [3068] : [3031], 6, why + ': obrażenia w czasie');
      if (effect === 'spellblade') add(ap ? [3100] : [3078,6662], 12, why + ': Spellblade');
    }
    if (r?.consumed && (s.completed || []).includes(a.id)) r.items.forEach(id => excluded.add(id));
    if (r?.items && !overridden && !(s.completed || []).includes(a.id)) {
      const ids = r.anyItem && (s.owned || []).some(id => r.items.includes(id)) ? [] : r.items;
      add(ids, 26, why + (r.quest ? ': przedmiot do zadania' : ': ulepszony przedmiot'));
    }
  }
  return { bonuses, hints, unknown, excluded, conversion, active: bonuses.size > 0, owned:s.owned || [], ownedBoots:s.ownedBoots || null };
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
}
module.exports = { choicesCatalog, validateSelection, adaptation, MayhemSession, EFFECTS };
