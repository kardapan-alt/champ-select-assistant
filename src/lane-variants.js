const { champInfo, runePageFor, buildFor } = require('./engine');
const { lanePlan } = require('./laneplan');
const { botLanePlan, enemyThreat } = require('./bot-plan');
const { normPosition } = require('./players');

const positions = ['top', 'jungle', 'middle', 'bottom', 'utility'];
const labels = { top:'Top', jungle:'Jungle', middle:'Mid', bottom:'ADC', utility:'Support' };

function assignments(state, queueId, game, data) {
  const role = normPosition(state.me?.position);
  const mine = game.championsById.get(state.me?.championId);
  if (state.mode !== 'classic' || Number(queueId) !== 420 || !mine || !['top','middle','bottom','utility'].includes(role)) return [];
  const opponents = state.enemies.filter(p => p.locked && p.championId && game.championsById.has(p.championId));
  if (!opponents.length || opponents.length > 5 || new Set(opponents.map(p=>p.championId)).size!==opponents.length) return [];
  // Enumerate only listed or confirmed positions and keep each role unique.
  // A partial draft can have an empty opposing lane in one of the two scenarios.
  let variants = [[]];
  for (const p of opponents) {
    const champion = game.championsById.get(p.championId);
    const confirmed = normPosition(p.position);
    const roles = positions.includes(confirmed) ? [confirmed] :
      [...new Set((champInfo(champion.alias, game, data).roles || []).map(normPosition).filter(r=>positions.includes(r)))];
    if (!roles.length) return [];
    const next = [];
    for (const variant of variants) for (const position of roles) {
      if (!variant.some(enemy=>enemy.position===position)) next.push([...variant, {championId:p.championId, position, locked:true}]);
    }
    variants = next;
  }
  const relevant = ['bottom','utility'].includes(role) ? ['bottom','utility'] : [role];
  const options = new Map();
  for (const enemies of variants) {
    const id = relevant.map(pos=>enemies.find(p=>p.position===pos)?.championId || 0).join('-');
    if (options.has(id)) continue;
    options.set(id, {id,enemies});
  }
  if (options.size < 2) return [];
  const result = [...options.values()];
  const championAt = (enemies, pos) => enemies.find(p=>p.position===pos)?.championId;
  const changingRoles = positions.filter(pos => new Set(result.map(o=>championAt(o.enemies,pos))).size>1);
  for (const option of result) {
    option.label = changingRoles.flatMap(pos => {
      const champion = game.championsById.get(championAt(option.enemies,pos));
      return champion ? [labels[pos]+' · '+champion.name] : [];
    }).join(' / ');
  }
  const knownOnLane = o => relevant.filter(pos=>championAt(o.enemies,pos)).length;
  return result.sort((a,b)=>knownOnLane(b)-knownOnLane(a));
}

function laneVariantOptions(state,queueId,game,data) {
  const options = assignments(state,queueId,game,data);
  if (!options.length) return null;
  const key = JSON.stringify([state.me.championId, state.me.position, state.allies.map(p=>[p.championId,p.position,p.locked]),options.map(o=>o.enemies)]);
  return {key,options:options.map(({id,label})=>({id,label}))};
}

function scenarioInfo(state, option, game, data) {
  const me = {...state.me,position:normPosition(state.me.position)};
  const alias = game.championsById.get(me.championId).alias;
  const context = {...state, me, allies:state.allies.filter(p=>p.isMe||p.locked), enemies:option.enemies};
  const page = runePageFor(alias,game,data,context);
  const build = buildFor(alias,context,game,data);
  const direct = option.enemies.some(p=>p.position===me.position);
  // lanePlan's fallback is for ordinary drafts. Here an explicitly off-lane pick
  // must never fill a still-unrevealed lane in the hypothetical arrangement.
  const lane = direct ? lanePlan(me,option.enemies,null,game,data) : null;
  const duo = botLanePlan({...context,me:{...me,locked:true}},420,game,data);
  let tips = lane?.tips || ['Przeciwnik na Twojej pozycji pozostaje nieznany.'];
  if (duo) tips = [duo.trade,duo.threat];
  else if (['bottom','utility'].includes(me.position)) {
    const pair = ['bottom','utility'].map(pos=>{
      const player=option.enemies.find(p=>p.position===pos);
      if(!player)return null;
      const champ=game.championsById.get(player.championId);
      return {...champInfo(champ.alias,game,data),name:champ.name};
    });
    if (pair.every(Boolean)) tips = [...tips, enemyThreat(...pair)];
    else if (pair.some(Boolean)) {
      const missing = pair[0] ? 'supporta' : 'ADC';
      tips = [...tips, 'Do planu 2 na 2 brakuje wyboru '+missing+' przeciwnika.'];
    }
  }
  return {runes:page.selectedPerkIds, first:build.items[0]?.name, component:lane?.firstBack?.name, tips};
}

function compareLaneVariants(state, queueId, game, data, ids) {
  if (!Array.isArray(ids) || ids.length!==2 || ids[0]===ids[1]) throw Error('Wybierz dwa różne ustawienia.');
  const options = assignments(state,queueId,game,data);
  const results = ids.map(id=>{
    const option=options.find(o=>o.id===id);
    if(!option) throw Error('Dane draftu zmieniły się. Otwórz podgląd ponownie.');
    return scenarioInfo(state,option,game,data);
  });
  const [a,b]=results;
  const rows=[];
  const changedRunes=a.runes.map((id,i)=>id===b.runes[i] ? -1 : i).filter(i=>i>=0);
  if(changedRunes.length) rows.push({title:'Runy',values:results.map(r=>changedRunes.map(i=>game.perks.get(r.runes[i])?.name||String(r.runes[i])))});
  if(a.first!==b.first)rows.push({title:'Pierwszy przedmiot',values:results.map(r=>[r.first || 'Brak zakupu w planie'])});
  if(a.component!==b.component)rows.push({title:'Komponent przy trudnej linii',values:results.map(r=>[r.component || 'Brak wskazanego komponentu'])});
  const tips=results.map((r,i)=>r.tips.filter(t=>!results[1-i].tips.includes(t)));
  if(tips.some(t=>t.length))rows.push({title:'Plan linii',values:tips});
  return rows;
}

module.exports = { laneVariantOptions, compareLaneVariants };
