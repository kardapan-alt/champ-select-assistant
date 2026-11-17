const { champInfo, laneOpponentOf, matchupVerdict, teamProfile } = require('./engine');
const { normPosition } = require('./players');

const roles = ['top', 'jungle', 'middle', 'bottom', 'utility'];

function normalizePool(saved) {
  const aliases = Array.isArray(saved?.aliases) ? [...new Set(saved.aliases.filter(a => typeof a === 'string' && a.length > 0 && a.length <= 100))] : [];
  const selected = Array.isArray(saved?.pair) ? saved.pair.filter(a => aliases.includes(a)) : [];
  return { aliases, pair: [...new Set([...selected, ...aliases])].slice(0, 2) };
}

class PickPools {
  constructor(saved, persist) {
    this.roles = Object.fromEntries(roles.map(role => [role, normalizePool(saved?.[role])]));
    this.persist = persist;
  }

  edit({ role, action, alias, side }, game) {
    if (!roles.includes(role)) throw Error('Wybierz rolę.');
    const pool = this.roles[role];
    let { aliases, pair } = pool;
    if (action === 'add') {
      if (!game.championsByAlias.has(alias) || alias.startsWith('Jade_')) throw Error('Wybierz postać z katalogu.');
      if (aliases.includes(alias)) return;
      aliases = [...aliases, alias];
    } else if (action === 'remove') {
      aliases = aliases.filter(a => a !== alias);
    } else if (action === 'compare') {
      if (![0, 1].includes(side) || !aliases.includes(alias)) throw Error('Wybierz postać ze swojej puli.');
      pair = [...pair];
      const other = 1 - side;
      if (pair[other] === alias) pair[other] = pair[side];
      pair[side] = alias;
    } else throw Error('Nieznana zmiana puli.');
    const next = { ...this.roles, [role]: normalizePool({ aliases, pair }) };
    this.persist(next);
    this.roles = next;
  }
}

function availability(champ, state, game) {
  if (!champ) return 'Brak w katalogu klienta';
  if (state.bans.has(champ.id)) return 'Ban lub blokada w drafcie';
  if ([...state.allies, ...state.enemies].some(p => p.locked && p.championId === champ.id)) return 'Już wybrany';
  if (state.pickable) return state.pickable.has(champ.id) ? 'Dostępny' : 'Niedostępny w kliencie';
  if (game.owned?.size && !game.owned.has(champ.id)) return 'Poza listą posiadanych';
  return 'Dostępność niepotwierdzona';
}

// The same aspects explain an advantage of one pick and the opportunity cost of the other.
function contributions(champ, allies, enemies, lane) {
  const t = champ.traits || [];
  const ally = teamProfile(allies), enemy = teamProfile(enemies);
  const points = [];
  const add = (key, text, weight) => points.push({ key, text, weight });
  const diver = enemies.find(c => c.class === 'assassin' || c.traits?.includes('dive'));
  const fragile = allies.find(c => ['adc','mage'].includes(c.class) && !c.traits?.includes('mobile'));
  const has = (...traits) => traits.some(trait => t.includes(trait));
  if (has('peel', 'antidive', 'disengage'))
    add('peel', fragile ? 'ochrona ' + fragile.name + (diver ? ' przed wejściem ' + diver.name : ' podczas walki') :
      diver ? 'ochrona sojuszników przed wejściem ' + diver.name : 'ochrona sojuszników, gdy rywale rozpoczynają walkę', diver || fragile ? 10 : 5);
  if (has('engage')) add('engage', 'inicjowanie walk dla drużyny', ally.count && !ally.engage ? 9 : 4);
  if (has('tankkiller')) add('tankkiller', 'długie wymiany z wytrzymałymi celami', enemy.tanks ? 9 : 4);
  if (has('frontline','tank')) add('frontline', 'gra w pierwszej linii przed sojusznikami', ally.count && !ally.frontline ? 8 : 3);
  if (has('heal','sustain','enchanter')) add('sustain', 'podtrzymywanie zdrowia w walkach na wyniszczenie', enemies.some(c => c.traits?.includes('poke')) ? 8 : 4);
  if (has('poke','siege')) add('poke', 'nękanie z dystansu przed rozpoczęciem walki', 4);
  if (has('dive','burst','pick')) add('catch', 'presja na odsłonięte cele przeciwnika', 4);
  if (has('splitpush','global')) add('side', 'presja na bocznych liniach', 4);
  if (has('scaling')) add('scaling', 'większe zagrożenie w późnej grze', 3);
  if (has('early')) add('early', 'presja we wczesnej fazie gry', 3);
  if (has('mobile','safe')) add('safe', 'bezpieczniejsze ustawienie podczas wymian', 3);
  if (has('teamfight','cc')) add('teamfight', 'wsparcie zespołu w walkach grupowych', 3);
  if (ally.count >= 2 && !ally.ap && champ.dmg === 'ap' && !['tank','support'].includes(champ.class)) add('magic','uzupełnienie obrażeń magicznych drużyny',9);
  if (ally.count >= 2 && !ally.ad && champ.dmg === 'ad' && !['tank','support'].includes(champ.class)) add('physical','uzupełnienie obrażeń fizycznych drużyny',9);
  if (lane && matchupVerdict(champ, lane) === 'good') add('matchup','korzystny układ linii przeciw ' + lane.name,8);
  return points.sort((a,b) => b.weight - a.weight);
}

function comparison(state, queueId, game, data, pools) {
  const role = normPosition(state.me?.position);
  if (Number(queueId) !== 420 || state.mode !== 'classic' || state.me?.locked || !roles.includes(role)) return null;
  const pool = pools.roles[role];
  const options = pool.aliases.map(alias => {
    const champ = game.championsByAlias.get(alias);
    return { alias, name: champ?.name || alias, availability: availability(champ, state, game) };
  });
  const visible = list => list.filter(p => p.locked && !p.isMe && p.championId && game.championsById.has(p.championId));
  const context = { me: { position: role }, allies: visible(state.allies),
    enemies: visible(state.enemies).map(p => ({ ...p, position: normPosition(p.position) })) };
  const info = alias => ({ ...champInfo(alias, game, data), name: game.championsByAlias.get(alias)?.name || alias });
  const team = players => players.map(p => info(game.championsById.get(p.championId).alias));
  const allies = team(context.allies), enemies = team(context.enemies);
  const opponent = laneOpponentOf(context, game, data);
  const lane = opponent && { ...opponent, name: game.championsByAlias.get(opponent.alias)?.name || opponent.alias };
  const pair = pool.pair.map(alias => options.find(o => o.alias === alias));
  const points = pair.map(c => game.championsByAlias.has(c.alias) ? contributions(info(c.alias), allies, enemies, lane) : []);
  const unique = points.map((own, i) => own.find(p => !points[1-i]?.some(q => q.key === p.key)));
  const cards = pair.map((c, i) => {
    const advantage = (unique[i] || points[i][0])?.text || 'Za mało danych o stylu tej postaci.';
    const alternative = unique[1-i];
    const risk = lane && game.championsByAlias.has(c.alias) && matchupVerdict(info(c.alias), lane) === 'bad';
    const cost = risk ? 'Trudny układ linii przeciw ' + lane.name + '.' : alternative ?
      pair[1-i].name + ' wnosi więcej w tym obszarze — ' + alternative.text + '.' : 'Profile nie wskazują wyraźnego kosztu względem drugiego picku.';
    return { ...c, advantage, cost };
  });
  return { role, options, cards, allies: allies.map(c => c.name), enemies: enemies.map(c => c.name),
    lane: lane?.name || '', inferredLane: !!lane?.laneInferred };
}

module.exports = { PickPools, comparison };
