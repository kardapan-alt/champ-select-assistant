const { inventoryOf } = require('./liveclient');
const { validateHeadliner, MAX_AUGMENTS } = require('./headliners');
const { EFFECTS } = require('./mayhem');
const { planOf, questSlotOf } = require('./plan-diff');
const { normalizeExpectation } = require('./build-expectation');

const FORMAT = 'champ-select-assistant/build-report';
const roles = ['top', 'jungle', 'middle', 'bottom', 'utility'];
const position = value => roles.includes(value) ? value : ({ mid:'middle', adc:'bottom', bot:'bottom', support:'utility' }[value] || '');
const id = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const ids = (list, max) => Array.isArray(list) ? list.slice(0,max).filter(id) : [];
const limited = (text, limit = 200) => typeof text === 'string' ? text.slice(0,limit) : '';

// Only game facts are included. Never serialize a player, an LCU response or a session object.
function scenarioFrom(state, build, game) {
  const aliasOf = player => game.championsById.get(player.championId)?.alias || '';
  const allies = state.allies.filter(player => !player.isMe && player !== state.me).slice(0,4);
  const selection = state.mayhem || {};
  const effects = {};
  for (const augment of ids(selection.augments,MAX_AUGMENTS)) {
    const values = selection.effects?.[augment];
    if (Array.isArray(values)) effects[augment] = values.filter(v => Object.hasOwn(EFFECTS,v)).slice(0,3);
  }
  const inventory = value => (value || []).map(i => ({ itemID:i.id, slot:i.slot, count:i.count }));
  return {
    alias:build.alias, role:position(state.me?.position), mode:state.mode,
    allies:allies.map(aliasOf), enemies:state.enemies.slice(0,5).map(aliasOf),
    choices:{ items:(state.choices?.items || []).map(p => ({slot:p.slot,id:p.id})), boots:id(state.choices?.boots) },
    ...(state.mode === 'mayhem' ? { mayhem:{
      augments:ids(selection.augments,MAX_AUGMENTS), completed:ids(selection.completed,MAX_AUGMENTS), effects,
      owned:state.liveInventory ? [] : ids(selection.owned,5), ownedBoots:state.liveInventory ? null : id(selection.ownedBoots),
      headliner:validateHeadliner(selection.headliner)
    }} : {}),
    context:{
      allyRoles:allies.map(p => position(p.position)), enemyRoles:state.enemies.slice(0,5).map(p => position(p.position)),
      roleQuests:!!state.roleQuestsEnabled, pool:state.mayhemPool === 'KIWI_JADE' ? 'KIWI_JADE' : 'KIWI',
      inventory:state.liveInventory ? inventory(state.liveInventory.items) : null,
      enemies:Array.isArray(state.liveEnemies) ? state.liveEnemies.map(p => ({ alias:aliasOf(p), items:inventory(p.items) })) : null,
      goal:id(build.nextPurchase?.id),
      ...(state.mode==='mayhem' && state.skippedItems?.length ? {skippedItems:[...state.skippedItems]} : {})
    }
  };
}

function createReport(state, build, game, {version, patch, gold}) {
  if (!build || !state || !['classic','aram','mayhem'].includes(state.mode)) throw Error('Brak aktywnego buildu.');
  return {
    format:FORMAT, schema:1, version:limited(version,30), patch:limited(patch,40) || null,
    scenario:scenarioFrom(state,build,game),
    observed:{
      gold:Number.isFinite(gold) ? gold : null, source:build.fromStats ? 'OP.GG' : build.baseSource ? 'OP.GG · zapisana baza' : 'Baza wbudowana',
      plan:planOf(build), questSlot:questSlotOf(build),
      target:build.shop?.target ? {id:build.shop.target.id, name:limited(build.shop.target.name), cost:build.shop.target.cost} : null
    }
  };
}

function readReport(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 128*1024) throw Error('Zgłoszenie jest za duże.');
  const r = JSON.parse(text.replace(/^\uFEFF/,''));
  if (r?.format !== FORMAT || r.schema !== 1 || typeof r.scenario?.alias !== 'string' || !r.scenario.alias || !['classic','aram','mayhem'].includes(r.scenario?.mode)
    || !Array.isArray(r.scenario.allies) || !Array.isArray(r.scenario.enemies) || r.scenario.allies.length>4 || r.scenario.enemies.length>5
    || ![...r.scenario.allies,...r.scenario.enemies].every(a=>typeof a === 'string') || ![...roles,''].includes(r.scenario.role)
    || !Array.isArray(r.observed?.plan) || r.observed.plan.length > 8 || !r.observed.plan.every(i=>i && id(i.id) && typeof i.name === 'string'))
    throw Error('Plik nie zawiera obsługiwanego zgłoszenia buildu.');
  if (r.expectation != null) r.expectation = normalizeExpectation(r.expectation);
  return r;
}

function replayContext(context, state, alias, game) {
  if (!context) return;
  state.roleQuestsEnabled = state.mode === 'classic' && context.roleQuests === true;
  state.mayhemPool = context.pool === 'KIWI_JADE' ? 'KIWI_JADE' : 'KIWI';
  if (state.mode==='mayhem' && context.skippedItems!==undefined) {
    if (!Array.isArray(context.skippedItems) || !context.skippedItems.every(id))
      throw Error('Zgłoszenie zawiera nieprawidłowe pominięte przedmioty.');
    state.skippedItems=[...new Set(context.skippedItems)];
  }
  state.allies.slice(1).forEach((p,i) => { p.position = position(context.allyRoles?.[i]); });
  state.enemies.forEach((p,i) => { p.position = position(context.enemyRoles?.[i]); });
  const parse = (value, champion) => {
    const inventory = inventoryOf(value,game,champion,state.mode,true);
    if (!inventory) throw Error('Zgłoszenie zawiera nieprawidłowe sloty ekwipunku.');
    return inventory;
  };
  if (context.inventory != null) state.liveInventory = parse(context.inventory,alias);
  if (context.enemies != null) {
    if (!Array.isArray(context.enemies) || context.enemies.length > 5 ||
      new Set(context.enemies.map(e=>e?.alias)).size !== context.enemies.length) throw Error('Nieprawidłowe zakupy przeciwników.');
    state.liveEnemies = context.enemies.map(e => {
      const champ = game.championsByAlias.get(e?.alias);
      if (!champ || !state.enemies.some(p => p.championId === champ.id)) throw Error('Zakupy należą do postaci spoza składu.');
      return {alias:champ.alias, championId:champ.id, items:parse(e.items,champ.alias).items};
    });
  }
}

module.exports = { createReport, readReport, replayContext };
