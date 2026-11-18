// Ekran ładowania: gracze obu drużyn i ich statystyki.
// Nicki są dostępne dopiero od ekranu ładowania (w champ selekcie Riot je ukrywa i aplikacja ich nie czyta).

const LOADING_PHASES = ['GameStart', 'InProgress'];
const DAY = 24 * 60 * 60 * 1000;

const POSITION_NAMES = {
  top: 'Top', jungle: 'Jungle', middle: 'Mid', mid: 'Mid', bottom: 'ADC', adc: 'ADC', utility: 'Support', support: 'Support',
};
const normPosition = (p) => ({ mid: 'middle', adc: 'bottom', bot: 'bottom', support: 'utility' }[String(p || '').toLowerCase()] || String(p || '').toLowerCase());

// Use only identities explicitly visible in this match. A public account
// profile by itself does not override a hidden/unspecified match identity.
function visibleIdentity(p, me, isMe) {
  const visibility = String(p.nameVisibilityType || '').toUpperCase();
  const profilePrivacy = String(p.privacy || p.summonerInfo?.privacy || '').toUpperCase();
  const hidden = (visibility && visibility !== 'VISIBLE') || p.isAnonymous === true || p.isNameHidden === true
    || p.isRiotIdHidden === true || p.isIncognito === true || p.isNameVisible === false || p.isRiotIdVisible === false
    || (profilePrivacy && profilePrivacy !== 'PUBLIC');
  const explicitlyVisible = visibility === 'VISIBLE' || p.isNameVisible === true || p.isRiotIdVisible === true;
  if (!isMe && (hidden || !explicitlyVisible)) return null;
  const source = isMe ? me : p;
  const gameName = String(source.gameName || source.riotIdGameName || source.summonerInfo?.gameName || '').trim();
  const tagLine = String(source.tagLine || source.riotIdTagLine || source.summonerInfo?.tagLine || '').trim();
  return gameName && tagLine ? { gameName, tagLine } : null;
}

async function readLoadingPlayers(lcu, session, previous) {
  if (session === undefined) session = await lcu.get('/lol-gameflow/v1/session');
  const gameData = session && session.gameData;
  if (!gameData) return null;
  const me = previous?.allies.find(p=>p.isMe) || await lcu.get('/lol-summoner/v1/current-summoner');
  const locale = previous?.region ? null : await lcu.get('/riotclient/region-locale');
  const region = previous?.region || locale?.webRegion || locale?.region || '';

  // Wybrane skiny: selectedSkinIndex z playerChampionSelections (id skina = champion * 1000 + numer).
  const selections = new Map((gameData.playerChampionSelections || []).map((s) => [s.puuid || s.summonerInternalName, s]));
  const skinOf = (p) => {
    if (p.selectedSkinId || p.skinId) return p.selectedSkinId || p.skinId;
    const s = selections.get(p.puuid) || selections.get(p.summonerInternalName);
    return s && p.championId && s.selectedSkinIndex > 0 ? p.championId * 1000 + s.selectedSkinIndex : 0;
  };
  const toPlayer = (p, teamIndex) => {
    const isMe = !!(me && p.puuid && p.puuid === me.puuid);
    const identity = visibleIdentity(p, me, isMe);
    return {
      puuid: isMe ? p.puuid : '',
      gameName: identity?.gameName || '',
      tagLine: identity?.tagLine || '',
      anonymous: !identity,
      championId: p.championId || 0,
      skinId: skinOf(p),
      position: normPosition(p.selectedPosition || p.position),
      team: teamIndex,
      isMe,
    };
  };
  const one = (gameData.teamOne || []).map((p) => toPlayer(p, 1));
  const two = (gameData.teamTwo || []).map((p) => toPlayer(p, 2));
  const myTeamIsTwo = two.some((p) => p.isMe);
  return {
    gameId: gameData.gameId || (session.gameData && session.gameData.gameId) || 0,
    region: String(region).toUpperCase(),
    allies: myTeamIsTwo ? two : one,
    enemies: myTeamIsTwo ? one : two,
  };
}

// Odmiana "gra": 1 gra, 2-4 gry, 5+ gier (12-14 gier).
const gier = (n) => (n === 1 ? 'gra' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'gry' : 'gier');
const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

const avg = (arr, f) => { const v = arr.map(f).filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// Gry pogrupowane po championach: liczba gier, winrate i KDA.
function championList(games, game) {
  const by = new Map();
  for (const g of games) {
    const e = by.get(g.championId) || { championId: g.championId, games: 0, wins: 0, results: 0, k: 0, d: 0, a: 0 };
    e.games++; if (typeof g.win === 'boolean') e.results++; if (g.win) e.wins++;
    e.k += g.kills; e.d += g.deaths; e.a += g.assists;
    by.set(g.championId, e);
  }
  return [...by.values()].sort((a, b) => b.games - a.games).slice(0, 8).map((e) => ({
    championId: e.championId,
    name: game.championsById.get(e.championId)?.name || '',
    games: e.games,
    winRate: e.results === e.games ? Math.round((e.wins / e.games) * 100) : null,
    kda: `${round(e.k / e.games)} / ${round(e.d / e.games)} / ${round(e.a / e.games)}`,
  }));
}

// Karta gracza: liczby i tagi wyliczone z jego ostatnich gier i statystyk sezonu.
function playerCard(player, summary, game, now = Date.now(),mode='classic') {
  if (player.anonymous) summary = null;
  const card = {
    name: player.anonymous ? 'Brak publicznego Riot ID' : player.gameName ? `${player.gameName}#${player.tagLine}` : 'Nieznany gracz',
    anonymous: !!player.anonymous,
    isMe: player.isMe,
    championId: player.championId,
    position: POSITION_NAMES[player.position] || '',
    loaded: !!summary,
    profileMode:mode,
    tags: [],
  };
  if (!summary) return card;
  card.profileSource = summary.profileSource;
  const { rank, seasonChampions = {}, games = [], seasonList = null } = summary;
  const champGames = games.filter((g) => g.championId === player.championId);
  const champName = (id) => game.championsById.get(id)?.name || '';

  if (rank) {
    const valid = [rank.wins,rank.losses].every(n => Number.isInteger(n) && n >= 0);
    const total = valid ? rank.wins + rank.losses : 0;
    card.rank = {
      label: `${rank.tier[0]}${rank.tier.slice(1).toLowerCase()}${rank.division && !['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(rank.tier) ? ` ${ROMAN[rank.division] || rank.division}` : ''}`,
      tier: rank.tier,
      queue:rank.solo?'Solo/duo':'Ranking',
      lp: rank.lp,
      winRate: total ? Math.round((rank.wins / total) * 100) : null,
      games: total || null,
    };
  }

  // Pula championów w sezonie (najczęściej grane), do rozwijanej listy na karcie.
  card.seasonChamps = Object.entries(seasonChampions)
    .map(([id, v]) => ({ championId: Number(id), name: champName(Number(id)), games: v.games, winRate: v.games && v.wins != null ? Math.round((v.wins / v.games) * 100) : null }))
    .filter((c) => c.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, 8);
  const season = seasonChampions[player.championId];
  card.champion = {
    seasonGames: season ? season.games : Object.keys(seasonChampions).length ? 0 : null,
    // Poza top listą OP.GG: wiemy tylko, że gier jest mniej niż u ostatniego championa na liście.
    seasonBelow: !season && seasonList && seasonList.partial ? seasonList.below : null,
    seasonWinRate: season && season.games && season.wins != null ? Math.round((season.wins / season.games) * 100) : null,
    recentGames: champGames.length,
    last30Days: champGames.filter((g) => g.createdAt && now - g.createdAt <= 30 * DAY).length,
    kda: champGames.length ? {
      k: round(avg(champGames, (g) => g.kills)), d: round(avg(champGames, (g) => g.deaths)), a: round(avg(champGames, (g) => g.assists)),
    } : null,
  };

  if (games.length) {
    const recentDays = games.filter((g) => g.createdAt && now - g.createdAt <= 30 * DAY);
    const rate = (list) => (list.length && list.every(g => typeof g.win === 'boolean') ? Math.round((list.filter((g) => g.win).length / list.length) * 100) : null);
    card.recent = {
      games: games.length,
      winRate: rate(games),
      last30Days: recentDays.length,
      // OP.GG daje najwyżej 20 ostatnich gier: gdy wszystkie są z 30 dni, gier mogło być więcej.
      last30More: recentDays.length === games.length && games.length >= 20,
      last30WinRate: rate(recentDays),
    };
    const champ30 = champGames.filter((g) => g.createdAt && now - g.createdAt <= 30 * DAY);
    card.champion.last30WinRate = rate(champ30);
    card.recent30Champs = championList(recentDays, game);
    // Rola grana najczęściej w ostatnich grach.
    const roles = {};
    for (const g of games) if (g.position) roles[normPosition(g.position)] = (roles[normPosition(g.position)] || 0) + 1;
    const mainRole = Object.entries(roles).sort((a, b) => b[1] - a[1])[0];
    card.mainRole = mainRole ? POSITION_NAMES[mainRole[0]] || mainRole[0] : '';

    const tag = (text, kind) => card.tags.push({ text, kind });
    const champCount = {};
    for (const g of games) champCount[g.championId] = (champCount[g.championId] || 0) + 1;
    const [topChamp, topCount] = Object.entries(champCount).sort((a, b) => b[1] - a[1])[0];
    if (games.length >= 10 && topCount / games.length >= 0.75) tag(`OTP ${champName(Number(topChamp))}`, 'info');
    if (card.champion.seasonGames >= 100) tag(`Doświadczony (${card.champion.seasonGames} ${gier(card.champion.seasonGames)})`, 'good');
    else if (!season || card.champion.seasonGames < 20) tag('Mała próba danych o championie', 'info');

    const deaths = avg(games, (g) => g.deaths);
    if (games.length >= 10 && deaths != null && deaths >= 7) tag(`Dużo zgonów (śr. ${round(deaths)})`, 'warn');
    const kp = avg(games, (g) => g.kp);
    if (kp != null && kp >= 60) tag(`Wysoki KP (${Math.round(kp)}%)`, 'good');
    // Historia OP.GG nie ma wyniku wizji: wtedy średnia z sezonowych statystyk championów.
    const visionPerMin = avg(games.filter((g) => g.vision != null && g.minutes), (g) => g.vision / g.minutes) ?? summary.visionPerMin ?? null;
    const isSupport = player.position === 'utility';
    if (visionPerMin != null && visionPerMin >= (isSupport ? 2.2 : 1.1)) tag('Dobra wizja', 'good');
    else if (visionPerMin != null && visionPerMin < (isSupport ? 1.3 : 0.5)) tag('Słaba wizja', 'warn');
    const csPerMin = avg(games.filter((g) => g.minutes && normPosition(g.position) !== 'utility'), (g) => g.cs / g.minutes);
    if (!isSupport && player.position !== 'jungle' && csPerMin != null && csPerMin >= 8) tag(`Dobry farm (${round(csPerMin)} CS/min)`, 'good');

    let streak = 0;
    for (const g of games) { if (g.win === games[0].win) streak++; else break; }
    if (streak >= 3 && typeof games[0].win === 'boolean') tag(games[0].win ? `Seria ${streak} wygranych` : `Seria ${streak} porażek`, games[0].win ? 'good' : 'warn');
    if (games.length >= 10 && mainRole && player.position && normPosition(mainRole[0]) !== player.position && mainRole[1] / games.length >= 0.6) tag('Inna rola niż w ostatnich grach', 'info');
  }
  // Historical profile numbers are context, not ARAM lane/vision advice.
  if(mode==='aram'||mode==='mayhem'){card.tags=[];card.position='';}
  return card;
}

const playerKey = p => `${p.gameName}#${p.tagLine}`;

async function refreshPlayerStats(target, lookup, active, changed, now = Date.now) {
  if (!active()) return;
  target.statsFetching ||= new Set();
  target.statsRetryAt ||= new Map();
  const visible = () => [...target.allies, ...target.enemies].filter(p => !p.anonymous && p.gameName && p.tagLine);
  const work = [];
  for (const player of visible()) {
    if (target.statsFetching.size >= 3) break;
    const key = playerKey(player);
    const prior = target.summaries[key];
    if ((prior && !prior.profileSource?.retry) || target.statsFetching.has(key) || now() < (target.statsRetryAt.get(key) || 0)) continue;
    target.statsFetching.add(key);
    work.push((async () => {
      let summary;
      try { summary = await lookup(player); } catch { summary = null; }
      target.statsFetching.delete(key);
      if (!active() || !visible().some(p => playerKey(p) === key)) return;
      target.summaries[key] = summary || false;
      if (!summary || summary.profileSource?.retry) target.statsRetryAt.set(key, now() + 60_000);
      else target.statsRetryAt.delete(key);
      changed();
    })());
  }
  await Promise.all(work);
}

module.exports = { LOADING_PHASES, readLoadingPlayers, playerCard, playerKey, refreshPlayerStats, gier, normPosition };
