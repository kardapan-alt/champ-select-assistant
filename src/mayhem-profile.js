const { usesMana } = require('./champion-identity');

// Damage type alone does not distinguish Leona from an AP damage dealer.
// Existing purchases/core establish an attack build; a generic AS/range bonus does not.
const ATTACK_CORE = new Set([3115,3124,3153,3091,6672,3085,3046,3031,6675,3078]);
function buildProfile(champion, { conversion, attackAP = false, owned = [] } = {}) {
  const kind = champion.buildClass || champion.class;
  const tank = !conversion && kind === 'tank';
  const support = !conversion && (kind === 'support' || (champion.traits || []).includes('enchanter') && kind !== 'mage');
  const ap = conversion ? conversion === 'ap' : attackAP || champion.dmg === 'ap' || champion.class === 'mage';
  const durable = !conversion && ['tank','fighter'].includes(kind);
  const adc = !conversion && champion.class === 'adc';
  const attacks = attackAP || adc || (!tank && !support && [...(champion.items || []),...owned].some(id=>ATTACK_CORE.has(id)));
  return { tank,support,ap,durable,adc,attacks,usesMana:usesMana(champion.alias) };
}

module.exports = { buildProfile };
