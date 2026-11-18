const {buildFor} = require('./engine');
const {withPurchaseGoal} = require('./next-purchase');
const {planOf} = require('./plan-diff');
const {validateSelection} = require('./mayhem');
const {MAX_AUGMENTS} = require('./headliners');
const catalog = new Map(require('../data/mayhem-augments.json').augments.map(a => [a.id, a]));

function validOffer(ids, pool) {
  return Array.isArray(ids) && ids.length === 3 && new Set(ids).size === 3
    && ids.every(id => catalog.get(id)?.pools.includes(pool));
}
const sameCards = (a, b) => a?.length === b?.length && a?.every((id, i) => id === b[i]);

function purchaseOrder(build) {
  const order = planOf(build).map(({id,name}) => ({id,name}));
  const boots = build.boots;
  if (boots?.id && !order.some(i => i.id === boots.id)) order.push({id:boots.id,name:boots.name,side:true});
  return order;
}

// Freeze all four outputs at the first frame of this offer. Later purchases,
// overrides, game-data updates and post-game corrections cannot change them.
function snapshotOffer(ids, state, alias, goal, game, data, inventory) {
  const cards = ids.map(id => ({id,name:catalog.get(id).name,english:catalog.get(id).english}));
  const snapshot = {cards,inventory};
  if (inventory === 'unknown') return snapshot;
  const simulate = scenario => purchaseOrder(withPurchaseGoal(alias,scenario,game,data,buildFor(alias,scenario,game,data),goal).build);
  snapshot.before = simulate(state);
  for (const card of cards) {
    try {
      const selection = validateSelection({...state.mayhem,
        // Automatic inventory may contain map-specific items that the manual
        // editor cannot enter. Keep the actual inventory in the simulation.
        ...(state.liveInventory ? {owned:[],ownedBoots:null} : {}),
        augments:[...state.mayhem.augments,card.id]},game,alias,state.mayhemPool);
      if (state.liveInventory) Object.assign(selection,{owned:state.mayhem.owned,ownedBoots:state.mayhem.ownedBoots});
      card.plan = simulate({...state,mayhem:selection});
    } catch {
      // A full set, conflicting conversions or unavailable items can prevent a
      // simulation without invalidating a card that was actually on screen.
    }
  }
  return snapshot;
}

// The detector can pick up the inner rim of an ornamented card. Allow for
// that offset when mapping a click below the card to its reroll button.
function rerollSlot(rects,event,aspect) {
  if (!rects?.length || !(event.width>0 && event.height>0) || !Number.isFinite(aspect)
    || Math.abs(event.width/event.height-aspect)>=.025) return -1;
  const x=event.x/event.width, y=event.y/event.height;
  return rects.findIndex(r=>Math.abs(x-(r.x+r.w/2))<r.w*.18 && y>r.y+r.h*1.055 && y<r.y+r.h*1.19);
}

function rerollInput(frame,event) {
  if (!frame || event.type==='focus' && event.focused) return;
  if (event.type==='focus' || event.type==='cancel') {
    frame.press=null;
    if (event.type==='cancel') frame.reroll=null;
    frame.visible=false;
    return;
  }
  if (!['down','up'].includes(event.type)) return;
  const slot=rerollSlot(frame.rects,event,frame.aspect);
  if (event.type==='down') {
    frame.reroll=null;
    frame.press=slot>=0 && frame.visible && frame.recordId && event.at>=frame.seenAt && event.at-frame.seenAt<=3500 ?
      {slot,at:event.at} : null;
  } else {
    if (frame.press && slot===frame.press.slot && event.at>=frame.press.at && event.at-frame.press.at<=1200)
      frame.reroll={slot,at:event.at};
    frame.press=null;
  }
}

function newFrame(previous, ids, at, capture) {
  if (previous && sameCards(previous.ids,ids) && at-previous.seenAt<30000) {
    previous.seenAt = at;
    return previous;
  }
  const event=previous?.reroll;
  const reroll = event && at>=event.at && at-event.at<=5500
    && ids.every((id,i) => i===event.slot ? id!==previous.ids[i] : id===previous.ids[i]);
  return {ids:[...ids],at,seenAt:at,replaces:reroll ? previous.recordId : null,...capture()};
}

function recordOffer(match, frame, pickId, receipt, source='screen') {
  if (!validOffer(frame.ids,frame.pool) || (pickId!=null && !frame.ids.includes(pickId))) return false;
  const history = match.offers ||= [];
  let last = history.at(-1);
  let dirty = false;
  // When the same screen finally reveals a manually supplied title, correct
  // this offer in place. Rerolls and later rounds have separate identities.
  if(frame.corrects && last?.id===frame.corrects && !last.picked && !last.replacedBy
    && !sameCards(last.cards.map(c=>c.id),frame.ids)){
    Object.assign(last,frame.snapshot);
    frame.recordId=last.id;
    dirty=true;
  }
  // On restart the game can still be showing the last recorded trio.
  const existing = last && sameCards(last.cards.map(c=>c.id),frame.ids)
    && (last.id===frame.recordId || (!last.picked && !last.replacedBy));
  if (!existing) {
    const entry = {id:frame.at,time:frame.time,...frame.snapshot};
    if (frame.replaces && last?.id===frame.replaces && !last.picked) {
      last.replacedBy = entry.id;
      entry.replaces = last.id;
    }
    history.push(entry);
    if (history.length > 64) { history.shift(); match.offersTrimmed = true; }
    last = entry;
    dirty = true;
  }
  frame.recordId = last.id;
  if (pickId && !last.picked) {
    last.picked = pickId;
    last.source = source;
    last.receipt = receipt;
    dirty = true;
  }
  return dirty;
}

function withdrawPicks(match, ids, receipt) {
  let dirty = false;
  for (const offer of match?.offers || []) {
    if (['screen','confirmed'].includes(offer.source) && ids.includes(offer.picked) && (!receipt || offer.receipt===receipt)) {
      delete offer.picked; delete offer.source; delete offer.receipt;
      dirty = true;
    }
  }
  return dirty;
}

function correctOffer(match, offerId, cardId) {
  const offer = match?.offers?.find(o => o.id===offerId);
  if (!offer || offer.replacedBy || ['screen','confirmed'].includes(offer.source)) throw Error('Możesz uzupełnić tylko niepotwierdzony wybór z zapisanej oferty.');
  if (cardId!==null && !offer.cards.some(c=>c.id===cardId)) throw Error('Wybierz kartę z tej trójki.');
  if (cardId && match.offers.some(o=>o!==offer && o.picked===cardId)) throw Error('Ta karta jest już przypisana do innej oferty.');
  // Keep observed inventory, comparisons and their timeline intact. Only
  // user-added cards are merged into the match summary for favorites.
  const observed = match.observedAugments || match.augments || [];
  const corrected = match.offers.filter(o=>o!==offer && o.source==='manual').map(o=>o.picked);
  if (cardId) corrected.push(cardId);
  const combined = new Map(observed.map(c=>[c.id,c]));
  for (const id of corrected) if (!combined.has(id)) combined.set(id,{id,name:catalog.get(id).name});
  if (combined.size>MAX_AUGMENTS) throw Error('Limit augmentów tego meczu jest już wykorzystany.');
  match.observedAugments = observed;
  match.augments = [...combined.values()];
  if (cardId) { offer.picked=cardId; offer.source='manual'; }
  else { delete offer.picked; delete offer.source; }
}

module.exports = {validOffer,sameCards,snapshotOffer,rerollSlot,rerollInput,newFrame,recordOffer,withdrawPicks,correctOffer};
