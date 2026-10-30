// Symulowany serwer MCP OP.GG do testów (format odpowiedzi jest przybliżony, prawdziwy może się różnić).
const http = require('http');
const data = require('../data/champions.json');

const aliases = [...Object.keys(data.champions), 'Zoe', 'KSante', 'Rumble'];
const idOf = (alias) => aliases.indexOf(alias) + 1;
const POS = { top: 'top', jungle: 'jungle', middle: 'mid', bottom: 'adc', support: 'support' };

const tools = [
  {
    name: 'lol-champion-analysis',
    inputSchema: { type: 'object', required: ['champion', 'game_mode', 'lang', 'position'], properties: {
      champion: { type: 'string', enum: aliases.map((a) => a.toUpperCase()) },
      game_mode: { type: 'string', enum: ['ARAM', 'RANKED', 'FLEX', 'URF'] },
      lang: { type: 'string', enum: ['ko_KR', 'en_US', 'pl_PL'] },
      position: { type: 'string', enum: ['top', 'jungle', 'mid', 'adc', 'support', 'none'] },
    } },
  },
  {
    name: 'lol-summoner-search',
    inputSchema: { type: 'object', required: ['game_name', 'tag_line', 'region', 'lang'], properties: {
      game_name: { type: 'string' }, tag_line: { type: 'string' }, region: { type: 'string', enum: ['KR', 'NA', 'EUW', 'EUNE', 'JP'] }, lang: { type: 'string', enum: ['en_US', 'ko_KR'] },
    } },
  },
  {
    name: 'lol-summoner-game-history',
    inputSchema: { type: 'object', required: ['game_name', 'tag_line', 'region', 'lang'], properties: {
      game_name: { type: 'string' }, tag_line: { type: 'string' }, region: { type: 'string', enum: ['KR', 'NA', 'EUW', 'EUNE', 'JP'] }, lang: { type: 'string', enum: ['en_US', 'ko_KR'] },
    } },
  },
  {
    name: 'lol-champion-positions-data',
    inputSchema: { type: 'object', required: ['lang'], properties: { lang: { type: 'string', enum: ['en_US', 'ko_KR'] }, format: { type: 'string', enum: ['csv', 'json'], default: 'csv' } } },
  },
];

// Meta: Rumble i K'Sante (spoza naszych danych) dostają role, a Vex awansuje na tier 1.
function metaCsv() {
  const rows = ['champion_id,name,position,tier,win_rate,pick_rate,play'];
  for (const [alias, c] of Object.entries(data.champions)) {
    rows.push(`${idOf(alias)},${alias},${POS[c.roles[0]]},${alias === 'Vex' ? 1 : 3},0.5,0.03,10000`);
  }
  rows.push(`${idOf('Rumble')},Rumble,top,2,0.52,0.04,9000`, `${idOf('Rumble')},Rumble,mid,3,0.5,0.01,2000`, `${idOf('KSante')},KSante,top,2,0.5,0.03,8000`);
  return rows.join('\n');
}

const calls = [];
function analysis(args) {
  calls.push(args);
  const alias = aliases.find((a) => a.toUpperCase() === args.champion);
  const id = idOf(alias);
  // Zed przegrywa z Vexem i Malzaharem, wygrywa z Lux.
  const own = data.champions[alias] || {};
  // Zed ma stałe dane pod testy, pozostali championowie dostają matchupy zgodne z wbudowanymi danymi.
  const counters = alias === 'Zed'
    ? [['Vex', 0.44, 900], ['Malzahar', 0.46, 700], ['Lux', 0.56, 800], ['Ahri', 0.5, 2000], ['Annie', 0.47, 20]]
    : [...(own.counters || []).map((a) => [a, 0.54, 800]), ...(own.weakVs || []).map((a) => [a, 0.46, 800]), ...(alias === 'Ahri' ? [['Zed', 0.488, 1800]] : [])];
  return `LolGetChampionAnalysis(data=Data(summary=Summary(champion_id=${id}, position='${args.position}'), `
    + `core_items=CoreItems(ids=[3165, 6653, 3157], play=1500, win_rate=0.52), `
    + `boots=Boots(ids=[3158], play=3000, win_rate=0.51), starter_items=StarterItems(ids=[1056, 2003], play=4000), `
    + `summoner_spells=SummonerSpells(ids=[14, 4], play=5000, win_rate=0.51), `
    + `runes=Runes(primary_page_id=8200, primary_rune_ids=[8229, 8226, 8210, 8237], secondary_page_id=8100, secondary_rune_ids=[8143, 8135], stat_mod_ids=[5008, 5008, 5001], play=2200, win_rate=0.53), `
    + `skill_masteries=SkillMasteries(ids=['Q', 'E', 'W'], play=3000), `
    + `counters=[${counters.map(([a, wr, play]) => `Counter(champion_id=${idOf(a)}, play=${play}, win_rate=${wr})`).join(', ')}]))`;
}

// Profile graczy: deterministyczne z nazwy, żeby zrzuty były powtarzalne.
const PLAYER_CHAMPS = {
  'Kowal Topu': ['Darius', 'TOP'], 'Leśny Duch': ['LeeSin', 'JUNGLE'], Daniel: ['Ahri', 'MID'], 'Strzał w Kolano': ['Jinx', 'ADC'], 'Hak i Latarnia': ['Thresh', 'SUPPORT'],
  'Topowy Młot': ['Mordekaiser', 'TOP'], 'Wilk z Zaun': ['Warwick', 'JUNGLE'], 'Cień Midu': ['Zed', 'MID'], 'Pułapkarka': ['Caitlyn', 'ADC'], Gwiezdna: ['Soraka', 'SUPPORT'],
};
const POOLS = { TOP: ['Garen', 'Camille', 'Ornn'], JUNGLE: ['Vi', 'Kayn', 'Graves'], MID: ['Syndra', 'Viktor', 'Orianna'], ADC: ['Kaisa', 'Ezreal', 'Ashe'], SUPPORT: ['Nautilus', 'Lulu', 'Nami'] };
const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const TIERS = ['SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER'];
function profile(args) {
  const h = hash(args.game_name);
  const [alias] = PLAYER_CHAMPS[args.game_name] || ['Garen'];
  const wins = 40 + (h % 120);
  const losses = 40 + ((h >>> 3) % 110);
  const mainGames = args.game_name === 'Cień Midu' ? 412 : args.game_name === 'Pułapkarka' ? 2 : 10 + (h % 140);
  return `SummonerProfile(data=Data(summoner=Summoner(game_name='${args.game_name}', tagline='${args.tag_line}', level=${30 + (h % 500)}), `
    + `league_stats=[LeagueStat(game_type='SOLORANKED', tier_info=TierInfo(tier='${TIERS[h % TIERS.length]}', division=${1 + (h % 4)}, lp=${h % 100}), win=${wins}, lose=${losses}), LeagueStat(game_type='FLEXRANKED', tier_info=TierInfo(tier='IRON', division=4, lp=0), win=1, lose=9)], `
    + `most_champions=MostChampions(champion_stats=[ChampionStat(champion_id=${idOf(alias)}, play=${mainGames}, win=${Math.round(mainGames * (0.45 + (h % 15) / 100))}, kill=${mainGames * 6}, death=${mainGames * 5}, assist=${mainGames * 7}), ${(POOLS[(PLAYER_CHAMPS[args.game_name] || [])[1]] || POOLS.TOP).map((a, j) => { const play = Math.max(1, Math.round(mainGames / (j + 2)) - j * 3); return `ChampionStat(champion_id=${idOf(a)}, play=${play}, win=${Math.round(play * (0.42 + ((h >>> j) % 18) / 100))}, kill=${play * 5}, death=${play * 5}, assist=${play * 6})`; }).join(', ')}])))`;
}
function history(args) {
  const h = hash(args.game_name);
  const [alias, pos] = PLAYER_CHAMPS[args.game_name] || ['Garen', 'TOP'];
  const feeder = args.game_name === 'Strzał w Kolano';
  const ward = args.game_name === 'Hak i Latarnia';
  const otp = args.game_name === 'Cień Midu';
  const games = [];
  for (let i = 0; i < 20; i++) {
    const pool = POOLS[pos] || POOLS.TOP;
    const champ = otp ? alias : [alias, alias, pool[0], alias, pool[1], alias, pool[2]][i % 7];
    const minutes = 25 + ((h + i) % 10);
    const win = feeder ? i >= 4 && (h + i) % 2 === 0 : args.game_name === 'Wilk z Zaun' ? i < 5 || i % 2 === 0 : (h + i) % 2 === 0;
    games.push(`Game(id='g${i}', created_at='${new Date(Date.now() - i * 2.5 * 86400000).toISOString()}', game_length_second=${minutes * 60}, `
      + `my_data=Participant(champion_id=${idOf(champ)}, position='${pos}', stats=Stats(result='${win ? 'WIN' : 'LOSE'}', kill=${3 + (h + i) % 7}, death=${feeder ? 9 + i % 3 : 2 + (h + i) % 5}, assist=${4 + (h + i) % 9}, `
      + `minion_kill=${pos === 'SUPPORT' ? 30 : minutes * 7}, neutral_minion_kill=${pos === 'JUNGLE' ? 150 : 8}, vision_score=${ward ? minutes * 3 : minutes}, op_score_kill_participation=${ward || otp ? 0.66 : 0.48})))`);
  }
  return `GameHistory(data=[${games.join(', ')}])`;
}

function handle(msg) {
  if (msg.method === 'initialize') return { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'mock-opgg', version: '1' } };
  if (msg.method === 'tools/list') return { tools };
  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params;
    if (name === 'lol-champion-positions-data') return { content: [{ type: 'text', text: metaCsv() }] };
    if (name === 'lol-champion-analysis') return { content: [{ type: 'text', text: analysis(args) }] };
    if (name === 'lol-summoner-search') return { content: [{ type: 'text', text: profile(args) }] };
    if (name === 'lol-summoner-game-history') return { content: [{ type: 'text', text: history(args) }] };
    return { isError: true, content: [{ type: 'text', text: 'unknown tool' }] };
  }
  return {};
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const msg = JSON.parse(body);
    if (msg.id === undefined) { res.writeHead(202); return res.end(); }
    // Odpowiedź jako strumień SSE, jak w Streamable HTTP.
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 'mock-session' });
    res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: handle(msg) })}\n\n`);
  });
});
server.calls = calls;
if (require.main === module) server.listen(Number(process.env.PORT || 3999), '127.0.0.1', () => console.log(`Mock OP.GG na http://127.0.0.1:${server.address().port}/mcp`));
module.exports = server;
