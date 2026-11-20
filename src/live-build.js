// Obserwujemy zakupy, nie zgadujemy aktualnych statystyk ani złota przeciwników.
// Kategorie pochodzą z katalogu bieżącego patcha. Drobny komponent sam nie
// wypiera rdzenia buildu; kilka gotowych zakupów może przyspieszyć odpowiedź.
const RULES = [
  { key:'armor', category:'Armor', short:'kupiony pancerz', spread:3,
    items:{adc:[3036],fighter:[3071],assassin:[6694]}, answer:'Przyspiesz przebicie pancerza.' },
  { key:'mr', category:'SpellBlock', short:'kupiona odporność na magię', spread:3,
    items:{mage:[3135]}, answer:'Przyspiesz procentowe przebicie odporności na magię.' },
  { key:'health', category:'Health', short:'kupione zdrowie', spread:3,
    items:{mage:[6653],adc:[3153],fighter:[3153]}, answer:'Rozważ obrażenia zależne od zdrowia celu.' },
  { key:'crit', category:'CriticalStrike', short:'kupione kryty', spread:2,
    items:{tank:[3143],fighter:[3143]}, answer:'Randuin’s Omen ogranicza obrażenia od trafień krytycznych.' },
  { key:'onhit', category:'AttackSpeed', short:'kupiona szybkość ataku', spread:2,
    items:{tank:[3110],fighter:[3110]}, answer:'Frozen Heart ogranicza szybkość ataków pobliskich wrogów.' },
  { key:'heal', category:'LifeSteal', short:'kupiona kradzież życia', spread:2,
    items:{tank:[3075],fighter:[6609],assassin:[6609],adc:[3033],mage:[3165],support:[3165]}, answer:'Przyspiesz antyleczenie; powinien je nakładać gracz, który może trafić leczony cel.' },
];

// Two independent purchases distinguish e.g. AP Alistar from a tank or an enchanter with support AP.
function offensiveBuild(items, game) {
  let magic = 0, physical = 0, magicItem = false, physicalItem = false;
  for (const it of items || []) {
    const tags = game.items.get(it.id)?.categories || [];
    if (it.kind === 'boots' && tags.includes('MagicPenetration')) { magic++; continue; }
    if (it.kind !== 'finished' || tags.includes('ManaRegen')) continue;
    if (tags.includes('SpellDamage') && !tags.includes('Damage')) { magic++; magicItem = true; }
    if (tags.includes('Damage') && !tags.includes('SpellDamage')) { physical++; physicalItem = true; }
  }
  if (magicItem && magic >= 2 && !physical) return 'ap';
  if (physicalItem && physical >= 2 && !magic) return 'ad';
  return null;
}

function liveSituations(enemies, poolKey, game, exists) {
  if (!Array.isArray(enemies)) return [];
  return RULES.flatMap(rule => {
    const evidence = enemies.map(enemy=>{
      const items = enemy.items.filter(i => ['finished','boots'].includes(i.kind)
        && (game.items.get(i.id)?.categories || []).includes(rule.category));
      return { ...enemy, items };
    }).filter(e=>e.items.length);
    const total = evidence.reduce((n,e)=>n+e.items.length,0);
    if (!evidence.some(e=>e.items.length>=2) && total<rule.spread) return [];
    const myItem = (rule.items[poolKey] || []).find(exists);
    if (!myItem) return [];
    const champions = evidence.map(e=>({ alias:e.alias, championId:e.championId,
      name:game.championsById.get(e.championId)?.name || e.alias }));
    return [{ key:rule.key === 'crit' || rule.key === 'onhit' || rule.key === 'heal' ? rule.key : `live-${rule.key}`,
      short:rule.short, level:2, weight:4+total, live:true, myItem, general:myItem, owner:'', vision:false,
      champions, text:`${champions.map(c=>c.name).join(', ')}: ${rule.short}`,
      answer:rule.answer, evidence:evidence.map(e=>({ championId:e.championId,
        name:game.championsById.get(e.championId)?.name || e.alias, items:e.items.map(i=>({id:i.id,name:i.name})) })) }];
  });
}

function mergeSituations(base, live) {
  const keys = new Set(live.map(s=>s.key));
  return [...live.sort((a,b)=>b.weight-a.weight), ...base.filter(s=>!keys.has(s.key))];
}

module.exports = { liveSituations, mergeSituations, offensiveBuild };
