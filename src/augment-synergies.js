const catalog=require('../data/mayhem-augments.json').augments;
const rules=require('./mayhem-rules');
const key=a=>a.api.replace(/^ARAM_/,'');
// Explicit effect interactions, separate from two augments merely preferring the same item.
const pairs=[
  {a:['Goliath','TankEngine','MoshMonster','GrowthSpurt'],b:['HeavyHitter','PressureCooker'],text:'Dodatkowe maksymalne HP wzmacnia obrażenia drugiego augmentu.',blocked:'healthConversion'},
  {a:['Vulnerability'],b:['InfernalConduit','PressureCooker','GrandmasChiliOil'],text:'Obrażenia w czasie mogą krytować dzięki Vulnerability.'},
  {a:['CircleofDeath'],b:['OceanSoul','RabbleRousing','Perseverance'],text:'Własne leczenie zasila obrażenia Circle of Death.',blocked:'noRegen'},
  {a:['JeweledGauntlet','JeweledBracelet'],b:['ItsCritical'],text:'Dodatkowa szansa na kryt wzmacnia możliwość krytycznych trafień umiejętności.',blocked:'attackConversion'},
  {a:['OneHitWonder'],b:['Recursion','InfiniteRecursion','SpecializedRecursion'],text:'Dodatkowy haste wzmacnia obrażenia wybranej umiejętności One Hit Wonder; nie skraca jej odnowienia.'},
];
function synergies(selection={}){
  const picked=(selection.augments||[]).map(id=>catalog.find(a=>a.id===id)).filter(Boolean);
  const active=picked.map(a=>rules[key(a)]).filter(Boolean),out=[];
  for(let i=0;i<picked.length;i++)for(let j=i+1;j<picked.length;j++){
    const a=picked[i],b=picked[j];
    // Manual effect corrections supersede automated pair rules, too.
    if(Object.hasOwn(selection.effects||{},a.id)||Object.hasOwn(selection.effects||{},b.id))continue;
    const rule=pairs.find(r=>(r.a.includes(key(a))&&r.b.includes(key(b)))||(r.a.includes(key(b))&&r.b.includes(key(a))));
    if(!rule||rule.blocked&&active.some(r=>r[rule.blocked]))continue;
    out.push({ids:[a.id,b.id],names:[a.name,b.name],text:rule.text});
  }
  return out;
}
module.exports={synergies};
