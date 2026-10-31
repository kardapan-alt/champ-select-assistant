// Ekran ładowania: gracze obu drużyn i ich statystyki.
// Nicki są dostępne dopiero od ekranu ładowania (w champ selekcie Riot je ukrywa i aplikacja ich nie czyta).

const LOADING_PHASES = ['GameStart', 'InProgress'];
const DAY = 24 * 60 * 60 * 1000;

const POSITION_NAMES = {
  top: 'Top', jungle: 'Jungle', middle: 'Mid', mid: 'Mid', bottom: 'ADC', adc: 'ADC', utility: 'Support', support: 'Support',
};
const normPosition = (p) => ({ mid: 'middle', adc: 'bottom', bot: 'bottom', support: 'utility' }[String(p || '').toLowerCase()] || String(p || '').toLowerCase());

// Gracze z sesji gry. Riot ID uzupełniamy z profilu, jeśli sesja go nie zawiera.
async function readLoadingPlayers(lcu) {
  const session = await lcu.get('/lol-gameflow/v1/session');
  const gameData = session && session.gameData;
  if (!gameData) return null;
  const me = await lcu.get('/lol-summoner/v1/current-summoner');
  const locale = await lcu.get('/riotclient/region-locale');
  const region = (locale && (locale.webRegion || locale.region)) || '';

  const toPlayer = async (p, teamIndex) => {
    let gameName = p.gameName || p.riotIdGameName || '';
    let tagLine = p.tagLine || p.riotIdTagLine || '';
    if ((!gameName || !tagLine) && p.puuid) {
      const s = await lcu.get(`/lol-summoner/v2/summoners/puuid/${p.puuid}`).catch(() => null);
      if (s) { gameName = s.gameName || gameName; tagLine = s.tagLine || tagLine; }
    }
    if (!gameName && p.summonerName && p.summonerName.includes('#')) [gameName, tagLine] = p.summonerName.split('#');
    return {
      puuid: p.puuid || '',
      gameName,
      tagLine,
      championId: p.championId || 0,
      position: normPosition(p.selectedPosition || p.position),
      team: teamIndex,
      isMe: !!(me && p.puuid && p.puuid === me.puuid),
    };
  };
  const one = await Promise.all((gameData.teamOne || []).map((p) => toPlayer(p, 1)));
  const two = await Promise.all((gameData.teamTwo || []).map((p) => toPlayer(p, 2)));
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
    const e = by.get(g.championId) || { championId: g.championId, games: 0, wins: 0, k: 0, d: 0, a: 0 };
    e.games++; if (g.win) e.wins++;
    e.k += g.kills; e.d += g.deaths; e.a += g.assists;
    by.set(g.championId, e);
  }
  return [...by.values()].sort((a, b) => b.games - a.games).slice(0, 8).map((e) => ({
    championId: e.championId,
    name: game.championsById.get(e.championId)?.name || '',
    games: e.games,
    winRate: Math.round((e.wins / e.games) * 100),
    kda: `${round(e.k / e.games)} / ${round(e.d / e.games)} / ${round(e.a / e.games)}`,
  }));
}

// Karta gracza: liczby i tagi wyliczone z jego ostatnich gier i statystyk sezonu.
function playerCard(player, summary, game, now = Date.now()) {
  const card = {
    name: player.gameName ? `${player.gameName}#${player.tagLine}` : 'Nieznany gracz',
    isMe: player.isMe,
    championId: player.championId,
    position: POSITION_NAMES[player.position] || '',
    loaded: !!summary,
    tags: [],
  };
  if (!summary) return card;
  const { rank, seasonChampions = {}, games = [] } = summary;
  const champGames = games.filter((g) => g.championId === player.championId);
  const champName = (id) => game.championsById.get(id)?.name || '';

  if (rank) {
    const valid = rank.wins >= 0 && rank.losses >= 0;
    const total = valid ? rank.wins + rank.losses : 0;
    card.rank = {
      label: `${rank.tier[0]}${rank.tier.slice(1).toLowerCase()}${rank.division && !['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(rank.tier) ? ` ${ROMAN[rank.division] || rank.division}` : ''}`,
      tier: rank.tier,
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
    seasonGames: season ? season.games : 0,
    seasonWinRate: season && season.games && season.wins != null ? Math.round((season.wins / season.games) * 100) : null,
    recentGames: champGames.length,
    last30Days: champGames.filter((g) => g.createdAt && now - g.createdAt <= 30 * DAY).length,
    kda: champGames.length ? {
      k: round(avg(champGames, (g) => g.kills)), d: round(avg(champGames, (g) => g.deaths)), a: round(avg(champGames, (g) => g.assists)),
    } : null,
  };

  if (games.length) {
    const wins = games.filter((g) => g.win).length;
    const recentDays = games.filter((g) => g.createdAt && now - g.createdAt <= 30 * DAY);
    const rate = (list) => (list.length ? Math.round((list.filter((g) => g.win).length / list.length) * 100) : null);
    card.recent = {
      games: games.length,
      winRate: Math.round((wins / games.length) * 100),
      last30Days: recentDays.length,
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
    else if (card.champion.seasonGames <= 3 && champGames.length <= 1) tag('Mało gier tym championem', 'warn');

    const deaths = avg(games, (g) => g.deaths);
    if (deaths != null && deaths >= 7) tag(`Dużo zgonów (śr. ${round(deaths)})`, 'warn');
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
    if (streak >= 3) tag(games[0].win ? `Seria ${streak} wygranych` : `Seria ${streak} porażek`, games[0].win ? 'good' : 'warn');
    if (mainRole && player.position && normPosition(mainRole[0]) !== player.position && mainRole[1] / games.length >= 0.6) tag('Gra poza swoją rolą', 'warn');
  }
  return card;
}

module.exports = { LOADING_PHASES, readLoadingPlayers, playerCard, gier };
