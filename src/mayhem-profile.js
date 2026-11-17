const { resources } = require('../data/champion-resources.json');

// Damage type alone does not distinguish Leona from an AP damage dealer.
// Existing purchases/core establish an attack build; a generic AS/range bonus does not.
const ATTACK_CORE = new Set([3115,3124,3153,3091,6672,3085,3046,3031,6675,3078]);
function buildProfile(champion, { conversion, attackAP = false, owned = [] } = {}) {
  const tank = !conversion && champion.class === 'tank';
  const support = !conversion && (champion.class === 'support' || (champion.traits || []).includes('enchanter'));
  const ap = conversion ? conversion === 'ap' : attackAP || champion.dmg === 'ap' || champion.class === 'mage';
  const durable = !conversion && ['tank','fighter'].includes(champion.class);
  const adc = !conversion && champion.class === 'adc';
  const attacks = attackAP || adc || (!tank && !support && [...(champion.items || []),...owned].some(id=>ATTACK_CORE.has(id)));
  const resource = resources[champion.alias];
  return { tank,support,ap,durable,adc,attacks,usesMana:resource ? resource === 'Mana' : null };
}

module.exports = { buildProfile };
