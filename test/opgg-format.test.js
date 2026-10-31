// Odpowiedzi w formacie prawdziwego serwera OP.GG MCP: nagłówek "class Nazwa: pola" i wartości bez nazw pól.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const opgg = require('../src/opgg');
const { emptyGameData } = require('../src/gamedata');
const { playerCard } = require('../src/players');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', `opgg-${name}.txt`), 'utf8');
const game = emptyGameData();
for (const [id, alias, name] of [[54, 'Malphite', 'Malphite'], [875, 'Sett', 'Sett'], [103, 'Ahri', 'Ahri'], [20, 'Nunu', 'Nunu & Willump'], [22, 'Ashe', 'Ashe'],
  [901, 'Smolder', 'Smolder'], [238, 'Zed', 'Zed'], [41, 'Gangplank', 'Gangplank'], [64, 'LeeSin', 'Lee Sin'], [89, 'Leona', 'Leona']]) {
  const c = { id, alias, name };
  game.championsById.set(id, c);
  game.championsByAlias.set(alias, c);
}

test('format OP.GG: pola pozycyjne dostają nazwy z nagłówka', () => {
  const meta = opgg.parsePayload(fixture('meta'));
  assert.equal(meta.data.positions.top[0].champion, 'Malphite');
  assert.equal(meta.data.positions.top[0].tier, 1);
  assert.equal(meta.data.positions.support[1].is_rip, true);
});

test('format OP.GG: meta po nazwach championów, rzadkie role pominięte', () => {
  const m = opgg.interpretMeta(fixture('meta'), game);
  assert.ok(m.tiers.S.includes('Malphite') && m.tiers.S.includes('Ahri'));
  assert.ok(m.tiers.A.includes('Sett') && m.tiers.A.includes('Ashe'));
  assert.ok(m.tiers.B.includes('Nunu'), 'Nunu & Willump po nazwie');
  assert.deepEqual(m.roles.Malphite, ['top'], 'mid z role_rate 5% to nie rola');
  assert.deepEqual(m.roles.Sett, ['top'], 'support oznaczony is_rip');
  assert.deepEqual(m.roles.Ashe, ['bottom', 'support']);
});

test('format OP.GG: kontry z my_win_rate, synergie po partnerze', () => {
  const a = opgg.interpretAnalysis(fixture('analysis'), game);
  assert.deepEqual(a.counters, ['Smolder']);
  assert.deepEqual(a.weakVs, ['Zed'], 'win_rate w weak_counters to winrate kontry, nie Ahri');
  assert.ok(a.matchups.Zed < 48);
  assert.deepEqual(a.synergy.sort(), ['Gangplank', 'Leona']);
  assert.equal(a.boots, 3020);
  assert.deepEqual(a.items, [3118, 4645, 3157]);
  assert.deepEqual(a.starters, [1056, 2003, 2003]);
  assert.deepEqual(a.spells, [4, 14]);
  assert.equal(a.skills, 'Q > W > E');
  assert.deepEqual(a.runes, { p: 8100, s: 8200, perks: [8112, 8139, 8140, 8106, 8210, 8226], shards: [5005, 5008, 5001] });
});

test('format OP.GG: profil i historia gracza na karcie z ekranu ładowania', () => {
  const s = opgg.interpretSummoner(fixture('summoner'), fixture('history'));
  assert.deepEqual(s.rank, { tier: 'EMERALD', division: 1, lp: 65, wins: 187, losses: 202, solo: true });
  assert.deepEqual(s.seasonChampions, { 103: { games: 40, wins: 25 }, 89: { games: 20, wins: 10 } }, 'bez championów z ostatnich gier');
  assert.equal(s.games.length, 2);
  const [g1] = s.games;
  assert.equal(g1.championId, 103);
  assert.equal(g1.win, true);
  assert.equal(g1.cs, 210);
  assert.equal(g1.minutes, 30);
  assert.equal(Math.round(g1.kp), 50);
  assert.equal(g1.createdAt, Date.parse('2026-10-30T01:04:50Z'));

  const now = Date.parse('2026-10-31T12:00:00Z');
  const card = playerCard({ gameName: 'Gracz', tagLine: 'TEST', championId: 103, position: 'middle' }, s, game, now);
  assert.equal(card.rank.label, 'Emerald I');
  assert.equal(card.rank.winRate, 48);
  assert.deepEqual(card.champion, { seasonGames: 40, seasonWinRate: 63, recentGames: 1, last30Days: 1, kda: { k: 6, d: 2, a: 9 }, last30WinRate: 100 });
  assert.equal(card.seasonChamps[0].name, 'Ahri');
  assert.deepEqual(card.recent, { games: 2, winRate: 50, last30Days: 1, last30WinRate: 100 });
});

test('historia gier: limit z maksimum schematu', () => {
  const tool = { inputSchema: { properties: { game_name: {}, tag_line: {}, limit: { type: 'integer', minimum: 5, maximum: 20 } } } };
  assert.deepEqual(opgg.buildArgs(tool, { gameName: 'Gracz', tagLine: 'TEST' }), { game_name: 'Gracz', tag_line: 'TEST', limit: 20 });
});

test('champion w UPPER_SNAKE_CASE, gdy schemat tego wymaga', () => {
  const tool = { inputSchema: { properties: { champion: { type: 'string', description: 'Champion name in UPPER_SNAKE_CASE Examples: ANNIE, OLAF' } } } };
  const arg = (champion, championName) => opgg.buildArgs(tool, { champion, championName }).champion;
  assert.equal(arg('Ahri', 'Ahri'), 'AHRI');
  assert.equal(arg('LeeSin', 'Lee Sin'), 'LEE_SIN');
  assert.equal(arg('LeeSin'), 'LEE_SIN');
  assert.equal(arg('Kaisa', "Kai'Sa"), 'KAISA');
  assert.equal(arg('Nunu', 'Nunu & Willump'), 'NUNU_WILLUMP');
  assert.equal(arg('DrMundo', 'Dr. Mundo'), 'DR_MUNDO');
});
