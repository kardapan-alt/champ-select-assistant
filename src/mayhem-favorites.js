const { createHash } = require('node:crypto');
const augments = new Map(require('../data/mayhem-augments.json').augments.map(a => [a.id, a]));
const itemNamesPl = require('../data/item-names-pl.json').items;
const catalog = require('../data/catalog.json');
const items = new Map(catalog.items.map(i => [i.id, i]));
const champions = new Map(catalog.champions.map(c => [c.alias, c]));
const NOTE_LIMIT = 400;

function combinationFrom(match) {
  if (!match || match.mode !== 'mayhem') throw Error('Wybierz zapisany mecz ARAM Mayhem.');
  if (!match.alias) throw Error('Brak rozpoznanej postaci w tym meczu.');
  const cards = (match.augments || []).filter(a => Number.isInteger(a.id)).map(a => {
    const known = augments.get(a.id);
    return { id:a.id, name:a.name || known?.name || String(a.id), english:known?.english || '' };
  });
  const inventory = (match.items || []).filter(i => Number.isInteger(i.id)).map(i => ({
    id:i.id, name:i.name || items.get(i.id)?.name || String(i.id),
    english:items.get(i.id)?.name || '', polish:itemNamesPl[i.id] || '',
    count:Number.isInteger(i.count) && i.count > 0 ? i.count : 1
  }));
  if (!cards.length && !inventory.length) throw Error('Brak odczytanych augmentów i przedmiotów do zapisania.');
  const h = match.headliner;
  const headliner = h ? { id:h.id, name:h.name || h.id, ability:h.ability || '' } : null;
  // Item slot shuffling does not make a new combo. Augment pick order does.
  const counts = new Map();
  for (const item of inventory) counts.set(item.id,(counts.get(item.id) || 0)+item.count);
  const signature = [match.alias,cards.map(a => a.id),headliner?.id,headliner?.ability,[...counts].sort((a,b) => a[0]-b[0])];
  const id = createHash('sha256').update(JSON.stringify(signature)).digest('hex');
  const champion = champions.get(match.alias);
  return { id, alias:match.alias, name:match.name || champion?.name || match.alias, english:champion?.name || '',
    augments:cards, headliner, items:inventory, incomplete:!!match.gap || match.reason !== 'ended', savedAt:Date.now(), note:'' };
}

class MayhemFavorites {
  constructor(saved = [], persist = () => {}) {
    this.entries = Array.isArray(saved) ? saved : [];
    this.persist = persist;
  }
  list() { return structuredClone(this.entries); }
  commit(next) {
    this.persist(next);
    this.entries = next;
  }
  add(match) {
    const combo = combinationFrom(match);
    const existing = this.entries.find(e => e.id === combo.id);
    if (existing) return { id:existing.id, added:false };
    this.commit([combo,...this.entries]);
    return { id:combo.id, added:true };
  }
  note(id,note) {
    if (typeof note !== 'string' || note.length > NOTE_LIMIT) throw Error('Notatka może mieć do 400 znaków.');
    if (!this.entries.some(e => e.id === id)) throw Error('Nie znaleziono tej kombinacji.');
    this.commit(this.entries.map(e => e.id === id ? {...e,note:note.trim()} : e));
  }
  remove(id) { this.commit(this.entries.filter(e => e.id !== id)); }
}
module.exports = { MayhemFavorites };
