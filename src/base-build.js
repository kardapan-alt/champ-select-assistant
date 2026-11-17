// Shopping identity follows the selected core, not just a broad client class.
const {purchaseItem}=require('./itemrules');
const SUPPORT_CORE=new Set([6617,6616,3504,3107,6620,3222,2065,2526,2530,4005,4006,6621]);
const isSupportCore=id=>SUPPORT_CORE.has(id);
function buildIdentity(champ,game) {
  const items=(champ.items || []).map(id=>game.items.get(purchaseItem(id))).filter(Boolean);
  const count=category=>items.filter(i=>i.categories?.includes(category)).length;
  const ap=count('SpellDamage'),ad=count('Damage');
  const dmg=ap>=2&&ap>ad?'ap':ad>=2&&ad>ap?'ad':champ.dmg;
  const buildClass=['tank','support'].includes(champ.class)&&ap>=2&&ap>ad&&!items.some(i=>SUPPORT_CORE.has(i.id))?'mage':champ.class;
  const buildStyle=items.some(i=>[3124,3302].includes(i.id))&&!items.some(i=>i.id===3031)?'onhit'
    :dmg==='ap'?'ap':count('CriticalStrike')?'crit':ad>=2?'ad-caster':buildClass;
  return {...champ,dmg,buildClass,buildStyle};
}
module.exports={buildIdentity,isSupportCore};
