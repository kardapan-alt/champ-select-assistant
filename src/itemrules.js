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

// Wzajemnie wykluczające się rodziny przedmiotów. Nie proponujemy dwóch
// ulepszeń Last Whisper ani dwóch źródeł Lifeline w jednym zestawie.
const EXCLUSIVE = [
  [3033, 3036, 6694, 3302],
  [3135, 3137],
  [3053, 3156, 6673],
  [3003, 3040], [3004, 3042], [3119, 3121],
];
function itemsCompatible(id, selected, repeat = new Set()) {
  return (!selected.includes(id) || repeat.has(id)) && !EXCLUSIVE.some((group) => group.includes(id) && selected.some((x) => group.includes(x)));
}

module.exports = { itemAvailable, itemsCompatible };
