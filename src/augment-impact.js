const engine = require('./engine');
const { withPurchaseGoal } = require('./next-purchase');
const { planOf, comparePlans } = require('./plan-diff');

// Recalculate only the missing-card side, at the moment we first see the pick.
// The observed side already includes live purchases, pins and the current goal.
function augmentImpact(id, state, observed, goalId, game, data) {
  const hint = observed.mayhem?.hints.find(card => card.id === id);
  const selection = state.mayhem;
  if (!hint || !selection?.augments.includes(id)) return null;
  const effects = { ...selection.effects };
  delete effects[id];
  const without = { ...state, mayhem:{
    ...selection, augments:selection.augments.filter(value => value !== id),
    completed:(selection.completed || []).filter(value => value !== id), effects
  }};
  const base = engine.buildFor(observed.alias,without,game,data);
  const prior = withPurchaseGoal(observed.alias,without,game,data,base,goalId).build;
  const upgrade = b => {
    const next = b.mayhem?.nextItem;
    return next?.upgrade ? { id:next.id, name:next.name } : null;
  };
  const before = planOf(prior), after = planOf(observed);
  return {
    before, after, changes:comparePlans(before,after),
    beforeUpgrade:upgrade(prior), afterUpgrade:upgrade(observed),
    requiredItems:(hint.requiredItems || []).map(i=>({id:i.id,name:i.name,status:i.status})),
    summary:hint.summary, supported:hint.supported
  };
}

module.exports = { augmentImpact };
