// Report files contain declarative item conditions. No user-provided code runs.
function normalizeExpectation(value) {
  if (value == null) return null;
  const validId = id => Number.isSafeInteger(id) && id > 0;
  if (!['include','exclude','after'].includes(value.kind) || !validId(value.itemId))
    throw Error('Nieprawidłowy warunek zakupów w zgłoszeniu.');
  if (value.kind !== 'after') return {kind:value.kind,itemId:value.itemId};
  if (!validId(value.prerequisiteId) || value.prerequisiteId === value.itemId)
    throw Error('Wybierz dwa różne przedmioty dla warunku kolejności.');
  return {kind:'after',itemId:value.itemId,prerequisiteId:value.prerequisiteId};
}

function checkExpectation(input, plan, sideSlot, game) {
  const condition = normalizeExpectation(input);
  if (!condition) return null;
  const {kind,itemId,prerequisiteId} = condition;
  const item = game.items.get(itemId), prerequisite = game.items.get(prerequisiteId);
  if (!item || (kind === 'after' && !prerequisite))
    return {passed:false, message:'Katalog nie zawiera przedmiotu z warunku. Sprawdź jego identyfikator.'};
  const index = plan.findIndex(i=>i.id === itemId);
  const present = index >= 0 || sideSlot?.id === itemId;
  if (kind === 'include') return {passed:present, message:'W planie powinien być '+item.name+'.'};
  if (kind === 'exclude') return {passed:!present, message:'Poza planem powinien pozostać '+item.name+'.'};
  // A side slot has no purchase position in the regular sequence.
  const earlier = plan.findIndex(i=>i.id === prerequisiteId);
  return {passed:!present || (earlier >= 0 && index > earlier),
    message:item.name+' może pojawić się dopiero po '+prerequisite.name+'.'};
}

module.exports = {normalizeExpectation,checkExpectation};
