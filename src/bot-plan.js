const { champInfo, laneOpponentOf } = require('./engine');
const { normPosition } = require('./players');
const runeContext = require('../data/rune-context.json').champions;

// Missable crowd control that can open a short trading window. No cooldown
// estimate: this is a pre-game matchup description, not live spell tracking.
const catchSpell = {
  Lux: 'Q', Morgana: 'Q', Blitzcrank: 'Q', Thresh: 'Q', Nautilus: 'Q',
  Leona: 'E', Nami: 'Q', Zyra: 'E', Neeko: 'E', Rakan: 'W', Pyke: 'Q',
};

function laneMember(players, position, game, data) {
  const assigned = players.filter(p => normPosition(p.position) === position);
  if (assigned.length > 1) return null;
  // A role assigned to an unknown or hovering champion stays unresolved.
  const candidates = (assigned.length ? assigned : players).filter(p => p.championId && p.locked !== false);
  const enemies = candidates.map(p => {
    const role = normPosition(p.position);
    return { championId: p.championId, position: ['top', 'jungle', 'middle', 'bottom', 'utility'].includes(role) ? role : '' };
  });
  const champ = laneOpponentOf({ me: { position }, enemies }, game, data);
  if (!champ?.alias) return null;
  return { ...champ, name: game.championsByAlias.get(champ.alias)?.name || champ.alias };
}

function tradePlan(carry, support, opponent) {
  const traits = support.traits || [];
  const spell = catchSpell[opponent.alias];
  const opening = spell ? `Po niecelnym ${spell} (${opponent.name}) macie chwilę na wymianę. ` : '';
  if (traits.includes('engage') || ['Blitzcrank', 'Pyke', 'Thresh'].includes(support.alias)) {
    const engage = support.alias === 'Leona' ? 'wejść z E' : 'zacząć wymianę';
    const follow = carry.alias === 'Xayah' ? ' Xayah może wtedy ustawić pióra za celem.' : '';
    return `${opening}${support.name} może ${engage}, gdy ${carry.name} jest już w zasięgu i może od razu dołożyć obrażenia.${follow}`;
  }
  if (traits.some(t => ['enchanter', 'peel', 'heal'].includes(t))) {
    return `${opening}${carry.name} może podejść do krótkiej wymiany, gdy ${support.name} jest w zasięgu wsparcia. Zostawcie sobie drogę powrotną do fali.`;
  }
  if (traits.includes('poke') || runeContext[support.alias]?.poke) {
    return `${opening}${support.name} może nękać rywala, gdy ten podchodzi do dobicia miniona. ${carry.name} może wtedy uderzyć ten sam cel z boku fali.`;
  }
  return `${opening}Ustawcie się na podobnej wysokości. Gdy ${support.name} podejdzie do wymiany, ${carry.name} powinien mieć w zasięgu ten sam cel.`;
}

function enemyThreat(carry, support) {
  if (carry.alias === 'Caitlyn' && runeContext[support.alias]?.tenacityCC) {
    return `Jeśli ${support.name} was unieruchomi, Caitlyn może podłożyć pułapkę pod cel. Pilnujcie wolnej drogi wyjścia z krzaków.`;
  }
  if (carry.alias === 'Xayah') return `Podczas wymiany z ${support.name} pilnujcie piór za plecami. Xayah może je przywołać z E i zatrzymać wasz odwrót.`;
  if (carry.alias === 'Ezreal') return `Ezreal może odskoczyć z E. Przed pościgiem sprawdźcie, czy po drugiej stronie fali czeka ${support.name}.`;
  if (carry.alias === 'Jhin') return `Przed wejściem sprawdźcie czwarty strzał Jhina. Po trafieniu przez ${support.name} łatwiej mu dołożyć unieruchomienie z W.`;
  if (support.traits?.includes('engage') || support.traits?.includes('pick')) {
    return `Gdy ${support.name} szuka wejścia, pilnujcie zasięgu ${carry.name}. Cofnijcie się razem, jeśli oboje rywale mogą zaatakować jedną osobę.`;
  }
  if (carry.traits?.includes('poke') || runeContext[carry.alias]?.poke) {
    return `${carry.name} może nękać przy dobijaniu minionów. Gdy ${support.name} też podchodzi do fali, oddajcie miniona, jeśli wymiana kosztowałaby zbyt dużo zdrowia.`;
  }
  return `Obserwujcie ustawienie obojga rywali. Jeśli ${support.name} wychodzi przed falę, sprawdźcie, czy ${carry.name} może od razu dołączyć do wymiany.`;
}

function botLanePlan({ me, allies, enemies, mode, gameId }, queueId, game, data, draft) {
  if (mode !== 'classic' || Number(queueId) !== 420 || !me?.championId || me.locked === false) return null;
  // Some gameflow snapshots omit the ally assignments previously shown in
  // draft. Carry them over only for these champions in this exact match.
  if (gameId && draft && String(gameId) === draft.gameId && me.championId === draft.meId) {
    const withRole = p => {
      if (['top','jungle','middle','bottom','utility'].includes(normPosition(p.position))) return p;
      const position = draft.positions.get(p.championId);
      return position ? { ...p, position } : p;
    };
    me = withRole(me);
    allies = allies.map(withRole);
  }
  const role = normPosition(me?.position);
  if (!['bottom', 'utility'].includes(role)) return null;
  const mine = game.championsById.get(me.championId);
  if (!mine) return null;
  const self = { ...champInfo(mine.alias, game, data), name: mine.name };
  const partner = laneMember(allies.filter(p => !p.isMe && p.championId !== me.championId), role === 'bottom' ? 'utility' : 'bottom', game, data);
  const enemyCarry = laneMember(enemies, 'bottom', game, data);
  const enemySupport = laneMember(enemies, 'utility', game, data);
  if (!partner || !enemyCarry || !enemySupport || enemyCarry.alias === enemySupport.alias) return null;
  const [carry, support] = role === 'bottom' ? [self, partner] : [partner, self];
  return {
    allies: [carry.name, support.name], enemies: [enemyCarry.name, enemySupport.name],
    inferred: [partner, enemyCarry, enemySupport].filter(c => c.laneInferred).map(c => c.name),
    trade: tradePlan(carry, support, enemySupport), threat: enemyThreat(enemyCarry, enemySupport),
  };
}

function rememberAllyRoles(state, queueId, gameId) {
  if (!gameId || state.mode !== 'classic' || Number(queueId) !== 420 || !state.me?.locked) return null;
  const positions = new Map(state.allies.filter(p => p.locked && p.championId && p.position).map(p => [p.championId, p.position]));
  return { gameId: String(gameId), meId: state.me.championId, positions };
}

module.exports = { botLanePlan, rememberAllyRoles, enemyThreat };
