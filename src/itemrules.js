const { usesMana } = require('./champion-identity');

// Klient dostarcza dane bieżącego patcha. Sama obecność ID nie oznacza,
// że przedmiot jest dostępny w sklepie na danej mapie.
function itemAvailable(id, game, mode = 'classic', alias = '') {
  if (!id) return false;
  if (!game.items.size) return true;
  const item = game.items.get(id);
  if (!item || item.inStore === false || item.gold?.purchasable === false) return false;
  if (item.requiredChampion && item.requiredChampion !== alias) return false;
  if (item.requiredAlly) return false;
  const map = ['aram', 'mayhem'].includes(mode) ? 12 : 11;
  if (Array.isArray(item.maps) && item.maps.length && !item.maps.map(Number).includes(map)) return false;
  if (item.maps && !Array.isArray(item.maps) && item.maps[String(map)] === false) return false;
  return true;
}

const bundledManaItems = new Set(require('../data/catalog.json').items
  .filter(item => item.categories?.includes('Mana')).map(item => item.id));
// Data Dragon 16.22.1 gives these historical Seraph's Embrace and Muramana
// variants 1000 mana. The client item categories omit it for both.
bundledManaItems.add(773040);
bundledManaItems.add(773042);
function itemGivesMana(id, game) {
  const item = game?.items?.get(Number(id));
  if (item?.categories?.includes('Mana') || item?.tags?.includes('Mana')) return true;
  const mana = item?.stats?.FlatMPPoolMod;
  if (Number.isFinite(mana)) return mana > 0;
  return bundledManaItems.has(Number(id));
}
function itemNeedsMana(id, game) {
  // Faerie Charm only regenerates mana. Other ManaRegen-tagged items can
  // provide healing to manaless users or carry a support quest.
  return Number(id) === 1004 || Number(id) === 771004 || itemGivesMana(id,game);
}

function itemFitsResource(id, game, alias) {
  return usesMana(alias) !== false || !itemNeedsMana(id, game);
}

// Wzajemnie wykluczające się rodziny przedmiotów. Nie proponujemy dwóch
// ulepszeń Last Whisper ani dwóch źródeł Lifeline w jednym zestawie.
const EXCLUSIVE = [
  [3033, 3036, 6694, 3302],
  [3135, 3137],
  [3053, 3156, 6673],
  [3003, 3040], [3004, 3042], [3119, 3121], [2526,2530],
];
function itemsCompatible(id, selected, repeat = new Set()) {
  return (!selected.includes(id) || repeat.has(id)) && !EXCLUSIVE.some((group) => group.includes(id) && selected.some((x) => group.includes(x)));
}

// To filtr rekomendacji, nie zakaz odczytu lub zapisu kupionego ekwipunku.
// Kilka różnych przedmiotów Spellblade nie daje kilku niezależnych proców.
const SPELLBLADE = new Set([3100,3078,6662,2510,3508,3877,6632]);
function redundantSpellblade(id, selected) {
  return SPELLBLADE.has(id) && selected.some(other => other !== id && SPELLBLADE.has(other));
}

// Statistical endpoints also report the automatic transformation, not a shop purchase.
const PURCHASE_FORM = {3040:3003,3042:3004,3121:3119,2530:2526};
const purchaseItem = id => PURCHASE_FORM[Number(id)] || Number(id);

module.exports = { itemAvailable, itemGivesMana, itemFitsResource, itemsCompatible, redundantSpellblade, purchaseItem };
