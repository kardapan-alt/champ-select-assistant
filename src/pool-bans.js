const { COUNTER_EDGE, MIN_GAMES } = require('./opgg');

function scopedSample(analyses, alias, opponent, role) {
  const analysis = analyses[alias];
  if (analysis?._key !== `${alias}:${role}:classic`) return null;
  const sample = analysis.matchupEvidence?.[opponent];
  if (!Number.isInteger(sample?.games) || sample.games < MIN_GAMES ||
      !Number.isFinite(sample.winRate) || sample.winRate < 0 || sample.winRate > 100) return null;
  return sample;
}

function evidence(alias, opponent, role, champions, analyses) {
  const direct = scopedSample(analyses, alias, opponent, role);
  const reverse = direct ? null : scopedSample(analyses, opponent, alias, role);
  if (direct || reverse) {
    const winRate = direct ? direct.winRate : 100 - reverse.winRate;
    const result = winRate <= 50 - COUNTER_EDGE ? 'bad' : winRate >= 50 + COUNTER_EDGE ? 'good' : 'even';
    return { result, winRate, games: (direct || reverse).games, source: 'OP.GG' };
  }
  const own = champions[alias], foe = champions[opponent];
  // Curated lists describe champions generally. Use them only in both champions' main role.
  if (own?.roles?.[0] === role && foe?.roles?.[0] === role) {
    const bad = !!(own.weakVs?.includes(opponent) || foe.counters?.includes(alias));
    const good = !!(own.counters?.includes(opponent) || foe.weakVs?.includes(alias));
    if (bad !== good) return { result: bad ? 'bad' : 'good', source: 'profil postaci' };
    if (bad && good) return { result: 'unknown', conflict: true };
  }
  return { result: 'unknown' };
}

function poolBans(state, pool, game, baseData, analyses) {
  if (!pool || !state.banPhase || !state.myBanTurn) return null;
  const { cards } = pool;
  const result = { common: [], covered: [], other: [], counts: cards.map(() => 0) };
  if (cards.length !== 2) return result;
  const blocked = cards.filter(c => !['Dostępny', 'Dostępność niepotwierdzona'].includes(c.availability));
  if (blocked.length) return { ...result, blocked: blocked.map(c => c.name) };
  const excluded = new Set([...state.bans, ...state.allies.map(p => p.championId),
    ...state.enemies.filter(p => p.locked).map(p => p.championId)]);
  const role = pool.role === 'utility' ? 'support' : pool.role;
  for (const [alias, champ] of game.championsByAlias) {
    if (champ.id <= 0 || alias.startsWith('Jade_') || excluded.has(champ.id) || cards.some(c => c.alias === alias)) continue;
    const pairs = cards.map(c => evidence(c.alias, alias, role, baseData.champions, analyses));
    pairs.forEach((p, i) => { if (p.result !== 'unknown') result.counts[i]++; });
    if (!pairs.some(p => p.result === 'bad')) continue;
    const row = { alias, name: champ.name || alias, pairs };
    if (pairs.every(p => p.result === 'bad')) result.common.push(row);
    else if (pairs.some(p => p.result === 'good')) result.covered.push(row);
    else result.other.push(row);
  }
  // Prefer measured matchups, then compare the weaker of the two measured advantages.
  const samples = r => r.pairs.filter(p => p.games);
  function compare(a, b) {
    const left = samples(a), right = samples(b);
    return right.length - left.length ||
      (left.length && Math.min(...right.map(p => Math.abs(p.winRate - 50))) - Math.min(...left.map(p => Math.abs(p.winRate - 50)))) ||
      a.name.localeCompare(b.name, 'pl');
  }
  for (const rows of [result.common, result.covered, result.other]) rows.sort(compare);
  return result;
}

module.exports = { poolBans };
