const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGameData } = require('../src/gamedata');
const { readLoadingPlayers, playerCard } = require('../src/players');
const { findLaneOpponent, lanePlan } = require('../src/laneplan');
const { gamePlan } = require('../src/gameplan');
const { suggestPicks, runePageFor } = require('../src/engine');
const game = buildGameData(require('../data/catalog.json'));
const data = require('../data/champions.json');
const id = alias => game.championsByAlias.get(alias).id;
const player = (alias, position) => ({ championId:id(alias), position });

test('a declared jungler cannot become the opponent on top in lane advice or pick suggestions', () => {
  const me = player('Garen','top'), darius = player('Darius','jungle');
  assert.equal(lanePlan(me,[darius],null,game,data),null);
  const picks = suggestPicks({me,allies:[me],enemies:[darius],bans:new Set()},game,data);
  assert.equal(picks.laneOpponent,null);
  const teemo = player('Teemo','');
  assert.equal(findLaneOpponent(me,[darius,teemo],game,data).player,teemo);
  assert.equal(lanePlan(me,[darius,teemo],null,game,data).inferred,true);
  assert.equal(findLaneOpponent(me,[teemo,player('Renekton','')],game,data),null);
  assert.equal(findLaneOpponent(me,[teemo,{championId:0,position:'TOP'}],game,data),null);
});

test('the loading roster keeps confirmed roles from this draft; current assignments and swaps take priority', async () => {
  const me = {...player('Garen','top'),isMe:true,locked:true};
  const draft = {mode:'classic',gameId:'765',me,allies:[me],enemies:[player('Renekton','middle'),player('Teemo','top')]};
  const flow = {gameData:{gameId:765,teamOne:[{puuid:'self',championId:me.championId}],teamTwo:[
    {championId:id('Renekton')},{championId:id('Teemo')},
  ]}};
  const lcu = {get:async url=>url.includes('current-summoner') ? {puuid:'self'} : {region:'EUW'}};
  const read = async () => readLoadingPlayers(lcu,flow,null,draft);
  let roster = await read();
  assert.deepEqual(roster.enemies.map(p=>p.position),['middle','top']);
  const runes = () => runePageFor('Garen',game,data,{mode:'classic',me:roster.allies[0],allies:roster.allies,enemies:roster.enemies});
  assert.equal(runes().laneOpponent,'Teemo');
  assert.ok(runes().selectedPerkIds.includes(8444));
  flow.gameData.teamTwo[0].selectedPosition='TOP';
  roster = await read();
  assert.deepEqual(roster.enemies.map(p=>p.position),['top','']);
  assert.equal(runes().laneOpponent,'Renekton');
  assert.ok(runes().selectedPerkIds.includes(8473));
  delete flow.gameData.teamTwo[0].selectedPosition;
  flow.gameData.gameId=766;
  assert.deepEqual((await read()).enemies.map(p=>p.position),['','']);
});

test('the OTP tag describes the most-played champion; lane and team advice check the current pick', () => {
  const me = player('Lulu','utility'), yuumi = player('Yuumi','utility'), vayne = player('Vayne','utility');
  const games = Array.from({length:10},()=>({...player('Vayne','utility'),win:false,kills:1,deaths:1,assists:1}));
  const summary = {games,seasonChampions:{[yuumi.championId]:{games:25,wins:12},[vayne.championId]:{games:25,wins:12}}};
  const card = p=>playerCard(p,summary,game);
  assert.ok(card(yuumi).tags.some(t=>t.text==='OTP Vayne'));
  assert.deepEqual(gamePlan([me],[yuumi],card,game,data).threats,[]);
  assert.ok(!lanePlan(me,[yuumi],card,game,data).tips.some(t=>t.includes('zna Yuumi bardzo dobrze')));
  assert.ok(gamePlan([me],[vayne],card,game,data).threats.some(t=>t.why.includes('prawie tylko')));
  assert.ok(lanePlan(me,[vayne],card,game,data).tips.some(t=>t.includes('zna Vayne bardzo dobrze')));
});
