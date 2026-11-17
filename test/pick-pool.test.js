const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGameData } = require('../src/gamedata');
const { readSession } = require('../src/engine');
const { PickPools, comparison } = require('../src/pick-pool');
const data = require('../data/champions.json');
const game = buildGameData(require('../data/catalog.json'));
const id = alias => game.championsByAlias.get(alias).id;
const player = (name, position, locked = true) => ({ championId: id(name), position, locked });
const state = () => ({
  mode: 'classic', me: { position: 'utility', locked: false }, bans: new Set(), pickable: new Set([id('Braum'),id('Leona')]),
  allies: [player('Jinx', 'bottom'), player('Malphite', 'top')],
  enemies: [player('Zed','middle'), player('Tristana','bottom')],
});
const favorites = () => new PickPools({ utility:{ aliases: ['Leona','Braum','Lulu'] } }, () => {});

test('pule i para po ponownym otwarciu; zmiany dotyczą tylko wybranej roli', () => {
  let disk;
  const store = new PickPools(null, next => { disk = structuredClone(next); });
  const edit = (action, alias, side, role = 'utility') => store.edit({action, alias, side, role},game);
  for (const alias of ['Leona','Braum','Lulu','Leona']) edit('add', alias);
  edit('add', 'Xayah', undefined, 'bottom');
  edit('compare','Lulu',0);
  edit('compare','Lulu',1); // Selecting the opposite card swaps the two sides.
  assert.deepEqual(new PickPools(disk,()=>{}).roles.utility, {aliases:['Leona','Braum','Lulu'],pair:['Braum','Lulu']});
  edit('remove','Braum');
  assert.deepEqual(store.roles.utility.pair,['Lulu','Leona']);
  assert.deepEqual(store.roles.bottom.pair,['Xayah']);
  assert.throws(() => edit('compare','Lux',0));
  assert.throws(() => edit('add','UnknownChampion'));
  const failed = new PickPools(disk, () => {throw Error('disk');});
  assert.throws(() => failed.edit({role:'bottom',action:'remove',alias:'Xayah'},game));
  assert.deepEqual(failed.roles.bottom.pair,['Xayah']);
});

test('Leona i Braum: unikalna zaleta, koszt alternatywy i widoczni uczestnicy draftu', () => {
  const s = state();
  const compare = () => comparison(s, 420, game, data, favorites());
  const result = compare();
  assert.match(result.cards[0].advantage, /inicjowanie/);
  assert.match(result.cards[1].advantage, /ochrona Jinx.*Zed/);
  assert.match(result.cards[0].cost, /Braum.*ochrona/);
  assert.match(result.cards[1].cost, /Leona.*inicjowanie/);
  assert.deepEqual(result.enemies,['Zed','Tristana']);
  assert.deepEqual(result.allies,['Jinx','Malphite']);
  s.enemies[0] = player('Ahri','middle', false);
  s.allies[0] = player('Jinx','bottom', false);
  const partial = compare();
  assert.deepEqual(partial.enemies,['Tristana']);
  assert.ok(!JSON.stringify(partial).includes('Jinx'));
  assert.ok(!JSON.stringify(partial).includes('Ahri'));
});

test('tylko SoloQ przed lockiem i potwierdzone picki; rozróżnia ban, wybrany pick oraz brak danych klienta', () => {
  const session = {
    localPlayerCellId:0,myTeam:[{cellId:0,assignedPosition:'support'}],
    theirTeam:[{cellId:5,championId:0,championPickIntent:id('Zed')},{cellId:6,championId:id('Braum'),assignedPosition:'utility'}],
    actions:[[{type:'pick', actorCellId:5, completed:true, championId:id('Zed')},{type:'pick',actorCellId:6,completed:true,championId:id('Braum')}]],
    bans:{myTeamBans:[id('Leona')]},
  };
  const s = readSession(session);
  const compare = (queue = 420) => comparison(s, queue, game, data, favorites());
  const result = compare();
  assert.deepEqual(result.enemies, ['Braum']);
  assert.deepEqual(result.cards.map(c=>c.availability), ['Ban lub blokada w drafcie','Już wybrany']);
  for (const queue of [440,400,450,2400,0]) assert.equal(compare(queue),null);
  s.bans.clear();
  assert.equal(compare().options[0].availability,'Dostępność niepotwierdzona');
  s.pickable = new Set([id('Lulu')]);
  assert.equal(compare().options[0].availability,'Niedostępny w kliencie');
  s.me.locked = true;
  assert.equal(compare(),null);
  s.me.locked = false; s.mode='mayhem';
  assert.equal(compare(),null);
});
