// In the purchase order the usual boots follow the first item. ADC quest boots
// and support quest items have a separate slot and never renumber the main six.
function planItem(item) {
  return {id:item.id, name:String(item.name || item.id).slice(0,200),
    reason:String(item.why || '').slice(0,450), source:String(item.source || '').slice(0,40)};
}
function planOf(build) {
  const items = [...build.items];
  if (build.boots?.id && build.inventory?.bootsSlot === 'inventory') items.splice(1,0,build.boots);
  return items.map(planItem);
}
function questSlotOf(build) {
  return build.quest?.slotItem?.id ? planItem(build.quest.slotItem) : null;
}
function comparePlans(before,after) {
  // Keep identical slots first. A second copy of an item must not turn an
  // unchanged copy into a removal or inflate the number of moved purchases.
  const taken = new Set();
  before.forEach((item,i) => { if (item.id === after[i]?.id) taken.add(i); });
  const changes = [];
  before.forEach((old,i) => {
    if (old.id === after[i]?.id) return;
    const j = after.findIndex((next,n) => next.id === old.id && !taken.has(n));
    if (j >= 0) taken.add(j);
    changes.push({id:old.id,name:old.name,from:i+1,to:j<0?null:j+1,
      previousReason:old.reason || '',reason:j<0?'':after[j].reason || ''});
  });
  after.forEach((item,i) => {
    if (!taken.has(i)) changes.push({id:item.id,name:item.name,from:null,to:i+1,
      previousReason:'',reason:item.reason || ''});
  });
  return changes;
}
module.exports = {planOf, questSlotOf, comparePlans};
