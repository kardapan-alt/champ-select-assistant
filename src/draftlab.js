// Czysta symulacja. Bez klienta, importów, zapisów preferencji i kont graczy.
const engine = require('./engine');
const { validateChoices } = require('./choices');
const { itemAvailable } = require('./itemrules');
const { isBootItem, baseBoots, SUPPORT_ITEMS } = require('./rolequests');
const mayhem = require('./mayhem');
const { replayContext } = require('./build-report');
const { withPurchaseGoal } = require('./next-purchase');
const { explainItem } = require('./item-inspection');
const englishNames = new Map(require('../data/catalog.json').items.map(i=>[i.id,i.name]));
const polishNames = require('../data/item-names-pl.json').items;
const ROLES = ['top', 'jungle', 'middle', 'bottom', 'utility'];

function catalog(game, data, state = { mode: 'classic' }, alias = '') {
  const known = new Set([...Object.values(data.itemPools).flat().map(i => i.id), ...Object.values(data.champions).flatMap(c => c.items || [])]);
  const items = [...game.items.values()].filter(i => itemAvailable(i.id, game, state.mode, alias) && !SUPPORT_ITEMS.has(i.id));
  return {
    champions: [...game.championsById.values()].filter(c => !c.alias.startsWith('Jade_')).map(c => ({ alias: c.alias, name: c.name, id: c.id })).sort((a,b) => a.name.localeCompare(b.name)),
    items: items.filter(i => !isBootItem(i.id, game) && (known.has(i.id) || i.priceTotal >= 1800)
      && !(i.categories || []).some(c => ['Consumable', 'Trinket'].includes(c))).map(i => ({ id: i.id, name: i.name })).sort((a,b) => a.name.localeCompare(b.name)),
    boots: items.filter(i => isBootItem(i.id, game) && baseBoots(i.id) === i.id && i.id !== 2422).map(i => ({ id: i.id, name: i.name })),
    ...(state.mode==='mayhem' ? {
      ownedItems:[...game.items.values()].filter(i=>mayhem.ownedAvailable(i.id,game,alias) && !isBootItem(i.id,game)).map(i=>({id:i.id,name:i.name})).sort((a,b)=>a.name.localeCompare(b.name)),
      ownedBoots:[...game.items.values()].filter(i=>mayhem.ownedAvailable(i.id,game,alias) && isBootItem(i.id,game)).map(i=>({id:i.id,name:i.name})),
    } : {}),
  };
}

function inspectionCatalog(game) {
  return [...game.items.values()].filter(i=>i.id>0 && i.name).map(i=>({
    id:i.id,name:i.name,english:englishNames.get(i.id) || '',polish:polishNames[i.id] || ''
  })).sort((a,b)=>a.name.localeCompare(b.name) || a.id-b.id);
}

function preview(input, game, data, {buildOnly=false,inspectItem=null} = {}) {
  if (!input || !game.championsByAlias.has(input.alias)) throw new Error('Wybierz swojego championa z listy.');
  if ((!ROLES.includes(input.role) && !(input.context && input.role === '')) || !['classic', 'aram', 'mayhem'].includes(input.mode)) throw new Error('Wybierz prawidłową rolę i tryb.');
  const validateTeam = (value, limit) => {
    if (!Array.isArray(value) || value.length > limit) throw new Error('Nieprawidłowa liczba championów.');
    const team = value.map(x => String(x || ''));
    if (team.some(x => x && !game.championsByAlias.has(x))) throw new Error('Champion nie występuje w katalogu.');
    const picked = team.filter(Boolean);
    if (new Set(picked).size !== picked.length) throw new Error('Ta sama postać nie może zajmować dwóch miejsc w drużynie.');
    return team;
  };
  const allies = validateTeam(input.allies || [], 4), enemies = validateTeam(input.enemies || [], 5);
  if (allies.includes(input.alias)) throw new Error('Twoja postać jest już w drużynie.');
  const player = (alias, position, isMe = false) => ({ championId: game.championsByAlias.get(alias)?.id || 0, position, isMe, locked: true });
  const others = ROLES.filter(r => r !== input.role);
  const me = player(input.alias, input.role, true);
  const state = { me, allies: [me, ...allies.map((a,i) => player(a, others[i]))], enemies: enemies.map((a,i) => player(a, ROLES[i])),
    mode: input.mode, roleQuestsEnabled: input.mode === 'classic', bans: new Set(), allLocked: true };
  replayContext(input.context,state,input.alias,game);
  if (input.mode === 'mayhem') {
    state.mayhem = mayhem.validateSelection(input.mayhem, game, input.alias,state.mayhemPool);
    if (state.liveInventory) Object.assign(state.mayhem,{owned:state.liveInventory.owned,ownedBoots:state.liveInventory.ownedBoots});
  }
  const base = engine.buildFor(input.alias, state, game, data);
  state.choices = validateChoices(input.choices || {}, base, input.alias, state, game);
  if (inspectItem != null) {
    if (!Number.isSafeInteger(inspectItem) || !game.items.has(inspectItem)) throw Error('Wybierz przedmiot z katalogu.');
    state.inspectItem = inspectItem;
  }
  const view = (p) => { const c = game.championsById.get(p.championId); return { ...p, champion: c ? { ...c, icon: `/lol-game-data/assets/v1/champion-icons/${c.id}.png` } : null }; };
  const natural = engine.buildFor(input.alias,state,game,data);
  const build = withPurchaseGoal(input.alias,state,game,data,natural,input.context?.goal).build;
  if (inspectItem != null) return {inspection:explainItem(inspectItem,state,build,game,data)};
  if (buildOnly) return {build};
  return { status: 'preview', build,
    myChampion: { alias: input.alias, name: game.championsByAlias.get(input.alias).name, locked: true,
      icon: `/lol-game-data/assets/v1/champion-icons/${me.championId}.png`, runes: engine.runePageFor(input.alias, game, data, state) },
    compositions: engine.compositions(state, game, data), allies: state.allies.map(view), enemies: state.enemies.map(view),
    choices: state.choices, mayhem:state.mayhem, catalog: catalog(game, data, state, input.alias) };
}
module.exports = { catalog, inspectionCatalog, preview };
