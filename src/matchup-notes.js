const { knownRole } = require('./training');
const { gameId } = require('./match-result');

const botPartner = { bottom:'utility', utility:'bottom' };

// Only positions actually provided by this game qualify. Our own locked draft
// assignments can fill gaps for the same allies in this exact match.
function matchupContexts(loading, queue, mode, game, draft) {
  const me = loading.allies.find(p => p.isMe);
  if (Number(queue)!==420 || mode!=='classic' || !gameId(loading.gameId) || !me?.puuid) return [];
  const own = game.championsById.get(me.championId);
  if (!own) return [];
  const sameDraft = draft?.gameId===String(loading.gameId) && draft.meId===me.championId;
  const allyRole = p => knownRole(p.position) || (sameDraft ? knownRole(draft.positions.get(p.championId)) : null);
  const role = allyRole(me);
  if (!role) return [];
  const contexts = [];
  const add = (kind, players, roleOf, otherRole) => {
    const atPosition = players.filter(p => !p.isMe && roleOf(p)===otherRole);
    const peer = atPosition.length===1 && game.championsById.get(atPosition[0].championId);
    if (peer) contexts.push({
      id:[role,own.alias,kind,otherRole,peer.alias].join('|'),
      role, kind, own:own.name, other:peer.name, otherRole,
    });
  };
  add('enemy',loading.enemies,p=>knownRole(p.position),role);
  if (botPartner[role]) {
    add('enemy',loading.enemies,p=>knownRole(p.position),botPartner[role]);
    add('duo',loading.allies,allyRole,botPartner[role]);
  }
  return contexts;
}

function recordMatchup(review, meta, contexts) {
  if (!meta.owner || (!contexts.length && review.value.active?.key!==meta.key)) return;
  const match = review.ensureActive(meta);
  if (match && match.owner===meta.owner && JSON.stringify(match.noteContexts)!==JSON.stringify(contexts)) {
    match.noteContexts = contexts;
    review.persist();
  }
}

class MatchupNotes {
  constructor(saved, persist) {
    this.entries = Array.isArray(saved) ? saved : [];
    this.persist = persist;
  }
  reminders(owner, contexts) {
    return this.entries.filter(entry=>entry.owner===owner && contexts.some(c=>c.id===entry.context.id))
      .map(({context,text,updatedAt})=>({context,text,updatedAt}));
  }
  view(owner, match) {
    const available = new Map();
    for (const c of (match?.owner===owner && match.mode==='classic' ? match.noteContexts || [] : []))
      available.set(c.id, {context:c, fromMatch:true, text:''});
    for (const {context,text,updatedAt} of this.entries.filter(e=>e.owner===owner))
      available.set(context.id,{context,fromMatch:available.has(context.id),text,updatedAt});
    return {owner, options:[...available.values()]};
  }
  edit(owner, match, input) {
    if (!owner || input.owner!==owner) throw Error('Aktywne konto uległo zmianie. Otwórz notes ponownie.');
    const option = this.view(owner,match).options.find(o=>o.context.id===input.id);
    if (!option) throw Error('Brak potwierdzonego matchupu dla tej notatki.');
    if (input.action!=='remove' && input.action!=='save') throw Error('Nieznana zmiana notatki.');
    if (input.action==='save' && (typeof input.text!=='string' || !input.text.trim() || input.text.trim().length>500))
      throw Error('Wpisz od 1 do 500 znaków.');
    const next = this.entries.filter(e=>e.owner!==owner || e.context.id!==input.id);
    if (input.action==='save') next.push({owner,context:option.context,text:input.text.trim(),updatedAt:Date.now()});
    this.persist(next);
    this.entries = next;
    return this.view(owner,match);
  }
}
module.exports = { matchupContexts, recordMatchup, MatchupNotes };
