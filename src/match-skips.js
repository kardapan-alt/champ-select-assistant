const {planOf} = require('./plan-diff');

function skipChoices(build) {
  if (!build.mayhem) return [];
  const protectedIds = new Set([...build.mayhem.questItems, build.quest?.slotItem?.id, build.nextPurchase?.id]);
  const planned = [...build.items];
  if (build.inventory.bootsSlot==='inventory') planned.splice(1,0,build.boots);
  if (build.mayhem.nextItem?.upgrade) planned.unshift(build.mayhem.nextItem);
  for (const item of planned) if (item?.owned || item?.pinned) protectedIds.add(item.id);
  return [...new Map(planned.filter(i=>i?.id && !protectedIds.has(i.id)).map(i=>[i.id,{id:i.id,name:i.name}])).values()];
}

function replacement(before, after, id) {
  const oldPlan=planOf(before), newPlan=planOf(after);
  const added=newPlan.find(item=>!oldPlan.some(old=>old.id===item.id));
  const next=added || newPlan[oldPlan.findIndex(old=>old.id===id)] ||
    (before.mayhem.nextItem?.id===id && after.mayhem.nextItem);
  if (!next) return '';
  const why=next.reason || next.why;
  return (added?'Wchodzi do planu: ':'Teraz na tym miejscu: ')+next.name+(why?' · '+why:'');
}

module.exports = {skipChoices,replacement};
