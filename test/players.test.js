const test = require('node:test');
const assert = require('node:assert');
const { LcuClient } = require('../src/lcu');
const { loadGameData } = require('../src/gamedata');
const opgg = require('../src/opgg');
const { readLoadingPlayers, playerCard } = require('../src/players');

process.env.PORT = '0';
const lcuServer = require('../mock/mock-lcu');
const opggServer = require('../mock/mock-opgg');

let lcu;
let game;
let provider;
const listening = (s) => new Promise((r) => (s.listening ? r() : s.once('listening', r)));

test.before(async () => {
  if (!opggServer.listening) opggServer.listen(0, '127.0.0.1');
  await Promise.all([listening(lcuServer), listening(opggServer)]);
  lcu = new LcuClient({ protocol: 'http', host: '127.0.0.1', port: lcuServer.address().port, password: 'x' });
  game = await loadGameData(lcu);
  provider = new opgg.OpggProvider({ endpoint: `http://127.0.0.1:${opggServer.address().port}/mcp` });
  await lcu.get('/__step?n=6');
});
test.after(() => { lcuServer.close(); opggServer.close(); });

test('gracze z ekranu ładowania, Twoja drużyna osobno', async () => {
  const players = await readLoadingPlayers(lcu);
  assert.equal(players.region, 'EUNE');
  assert.equal(players.allies.length, 5);
  assert.ok(players.allies.find((p) => p.isMe).gameName === 'Daniel');
  assert.deepEqual(players.enemies.map((p) => p.gameName), ['Topowy Młot', 'Wilk z Zaun', 'Cień Midu', 'Pułapkarka', 'Gwiezdna']);
  assert.equal(players.enemies[2].position, 'middle');
});

test('profil z OP.GG: ranga solo, sezon na championie, ostatnie gry', async () => {
  const s = await provider.summoner({ gameName: 'Cień Midu', tagLine: 'EUNE', region: 'EUNE' });
  assert.ok(s.rank && s.rank.solo, 'ranga z kolejki solo, nie flex');
  assert.notEqual(s.rank.tier, 'IRON');
  assert.equal(s.games.length, 20);
  const zedId = game.championsByAlias.get('Zed').id;
  assert.equal(s.seasonChampions[zedId].games, 412);
});

test('karty graczy i tagi', async () => {
  const players = await readLoadingPlayers(lcu);
  const cards = {};
  for (const p of [...players.allies, ...players.enemies]) {
    cards[p.gameName] = playerCard(p, await provider.summoner({ ...p, region: players.region }), game);
  }
  const tags = (n) => cards[n].tags.map((t) => t.text);
  for (const [n, c] of Object.entries(cards)) console.log(n, c.rank && c.rank.label, JSON.stringify(c.champion), tags(n).join(' | '));
  assert.ok(tags('Cień Midu').some((t) => t.startsWith('OTP')));
  assert.ok(tags('Cień Midu').some((t) => t.startsWith('Doświadczony')));
  assert.ok(tags('Strzał w Kolano').some((t) => t.startsWith('Dużo zgonów')));
  assert.ok(tags('Hak i Latarnia').includes('Dobra wizja'));
  assert.ok(tags('Pułapkarka').includes('Mało gier tym championem') === false || cards['Pułapkarka'].champion.seasonGames <= 3);
  assert.ok(tags('Wilk z Zaun').some((t) => /^Seria \d+ wygranych/.test(t)));
  assert.equal(cards['Cień Midu'].champion.last30Days > 0, true);
});

test('bez danych gracza karta pokazuje tylko nick i championa', () => {
  const card = playerCard({ gameName: 'X', tagLine: 'Y', championId: 1, position: 'top' }, null, game);
  assert.equal(card.loaded, false);
  assert.equal(card.name, 'X#Y');
});
