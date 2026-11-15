const { itemAvailable, itemsCompatible } = require('./itemrules');
const { isBootItem, baseBoots, SUPPORT_ITEMS } = require('./rolequests');

const choiceKey = (alias, state) => `${alias}:${state?.mode || 'classic'}:${state?.me?.position || 'unknown'}`;
const runeSignature = (page) => page ? JSON.stringify([page.primaryStyleId, page.subStyleId, page.selectedPerkIds]) : '';
function savedRunes(page) {
  return { primaryStyleId: Number(page.primaryStyleId), subStyleId: Number(page.subStyleId), selectedPerkIds: [...page.selectedPerkIds].map(Number) };
}
function validateRunes(page, game) {
  if (!page || !Array.isArray(page.selectedPerkIds) || page.selectedPerkIds.length !== 9) throw new Error('Strona musi zawierać 6 run i 3 odłamki.');
  const p = game.styles.get(page.primaryStyleId), s = game.styles.get(page.subStyleId);
  if (!p || !s || p.id === s.id) throw new Error('Wybierz dwa różne drzewka run.');
  const primary = p.slots.filter(x => x.type !== 'kStatMod');
  const secondary = s.slots.filter(x => x.type !== 'kStatMod').slice(1);
  const ids = page.selectedPerkIds;
  if (ids.slice(0, 4).some((id, i) => !primary[i]?.perks.includes(id))) throw new Error('Nieprawidłowe runy głównego drzewka.');
  const rows = ids.slice(4, 6).map(id => secondary.findIndex(x => x.perks.includes(id)));
  if (rows.includes(-1) || rows[0] === rows[1]) throw new Error('Runy poboczne muszą pochodzić z dwóch różnych rzędów.');
  const shards = p.slots.filter(x => x.type === 'kStatMod');
  if (shards.length && ids.slice(6).some((id, i) => !shards[i]?.perks.includes(id))) throw new Error('Nieprawidłowe odłamki run.');
  return savedRunes(page);
}

function normalizePins(choices, slots, valid, repeat = new Set()) {
  const pins = [], warnings = [];
  for (const p of Array.isArray(choices?.items) ? choices.items.slice(0, 6) : []) {
    const id = Number(p.id), slot = Number(p.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= slots || pins.some(x => x.slot === slot)
      || !valid(id) || !itemsCompatible(id, pins.map(x => x.id),repeat)) {
      warnings.push(`Nie można zachować przypiętego przedmiotu ${id} w slocie ${slot + 1}. Sprawdź własne wybory.`);
    } else pins.push({ id, slot });
  }
  return { pins: pins.sort((a, b) => a.slot - b.slot), warnings };
}

function validateChoices(choices, build, alias, state, game) {
  if (choices.items !== undefined && !Array.isArray(choices.items)) throw new Error('Nieprawidłowa lista przypiętych przedmiotów.');
  const valid = (id) => itemAvailable(id, game, state.mode, alias) && !isBootItem(id, game) && !SUPPORT_ITEMS.has(id)
    && !(game.items.get(id)?.categories || []).some(c => ['Consumable', 'Trinket'].includes(c));
  const { pins, warnings } = normalizePins(choices, build.inventory.itemSlots, valid, new Set(build.mayhem?.repeat || []));
  if ((choices.items || []).length > 6 || warnings.length) throw new Error(warnings[0] || 'Za dużo przypiętych przedmiotów.');
  let boots = null;
  if (choices.boots) {
    boots = Number(choices.boots);
    if (!itemAvailable(boots, game, state.mode, alias) || !isBootItem(boots, game) || baseBoots(boots) !== boots) throw new Error('Wybierz dostępne buty do kupienia, bez darmowego ulepszenia z questa.');
  }
  return { items: pins, boots, runes: choices.runes ? validateRunes(choices.runes, game) : null };
}

class ChoiceStore {
  constructor(initial = {}, save = () => {}) { this.entries = new Map(Object.entries(initial || {})); this.save = save; }
  get(alias, state) { return JSON.parse(JSON.stringify(this.entries.get(choiceKey(alias, state)) || { items: [], boots: null, runes: null })); }
  set(alias, state, value) {
    const next = new Map(this.entries);
    next.set(choiceKey(alias, state), JSON.parse(JSON.stringify(value)));
    this.save(Object.fromEntries(next));
    this.entries = next;
  }
}
function serialQueue() {
  let tail = Promise.resolve();
  return (job) => { const next = tail.then(job); tail = next.catch(() => {}); return next; };
}
module.exports = { ChoiceStore, choiceKey, savedRunes, runeSignature, validateRunes, validateChoices, normalizePins, serialQueue };
