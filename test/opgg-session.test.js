const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { OpggProvider } = require('../src/opgg');

const profileTool = 'lol_get_summoner_profile';
const historyTool = 'lol_list_summoner_matches';
const toolList = [profileTool, historyTool].map(name => ({name}));
const fixtures = Object.fromEntries([[profileTool,'summoner'],[historyTool,'history']].map(([tool,file]) =>
  [tool, fs.readFileSync(path.join(__dirname, 'fixtures', 'opgg-' + file + '.txt'), 'utf8')]));
const player = name => ({gameName:name, tagLine:'TEST', region:'EUNE'});

async function service(t) {
  const state = { session:null, opens:0, lists:0, calls:[], initHeaders:[], failure:0, historyFailure:false };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks).toString());
    const session = req.headers['mcp-session-id'];
    const send = (status, result, headers = {}) => {
      res.writeHead(status, {'Content-Type':'application/json', ...headers});
      res.end(result == null ? '' : JSON.stringify({jsonrpc:'2.0', id:message.id, result}));
    };
    if (message.method === 'initialize') {
      state.initHeaders.push(session);
      state.session = 'session-' + ++state.opens;
      return send(200, {capabilities:{}}, {'Mcp-Session-Id':state.session});
    }
    if (message.method === 'notifications/initialized') return send(202);
    if (message.method === 'tools/list') {
      state.lists++;
      return send(200, {tools:toolList});
    }
    const name = message.params.name;
    state.calls.push({session, name});
    if (session !== state.session) {
      // Late responses from the old generation must not invalidate the renewed one.
      if (name === historyTool) await new Promise(resolve => setTimeout(resolve, 50));
      return send(404);
    }
    if (state.failure) return send(state.failure);
    if (name === historyTool && state.historyFailure) return send(503);
    return send(200, {content:[{type:'text',text:fixtures[name]}]}, {'Mcp-Session-Id':session});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { state, provider:new OpggProvider({endpoint:`http://127.0.0.1:${server.address().port}/mcp`}) };
}

test('równoległe profile i historie odnawiają wygasłą sesję OP.GG jeden raz', async t => {
  const {state, provider} = await service(t);
  const initial = await provider.summoner(player('First'));
  assert.equal(initial.rank.tier, 'EMERALD');
  assert.equal(state.opens, 1);
  state.session = null;
  const results = await Promise.all(['A','B','C'].map(name => provider.summoner(player(name))));
  assert.ok(results.every(p => p.rank.tier === 'EMERALD' && p.games.length === 2 && p.profileSource.retry === false));
  assert.equal(state.opens, 2);
  assert.equal(state.lists, 2);
  assert.deepEqual(state.initHeaders, [undefined, undefined]);
  assert.equal(state.calls.filter(c => c.session === 'session-2').length, 6);
  assert.equal(provider.profileStatus.ok, true);
});

test('trwałe 404 kończy się po jednym ponowieniu, zachowuje cache i umożliwia późniejszy powrót', async t => {
  const {state, provider} = await service(t);
  const person = player('Known');
  await provider.summoner(person);
  const hit = provider.cache['summoner:eune:known#test'];
  hit.at -= 31 * 60_000;
  const lastGood = provider.profileStatus.lastSuccessAt;
  const priorCalls = state.calls.length;
  state.failure = 404;
  const stale = await provider.summoner(person);
  assert.equal(stale.profileSource.retry, true);
  assert.equal(stale.profileSource.cachedProfileAt, hit.profileAt);
  assert.equal(stale.rank.tier, 'EMERALD');
  assert.equal(state.opens, 2);
  assert.equal(state.calls.length - priorCalls, 4);
  assert.equal(provider.profileStatus.ok, false);
  assert.equal(provider.profileStatus.lastSuccessAt, lastGood);
  assert.match(provider.profileStatus.message, /ostatni pełny odczyt/);
  assert.ok(provider.retryConnectionAt > Date.now());
  assert.equal(await provider.summoner(player('Uncached')), null);
  assert.equal(state.opens, 2);
  state.failure = 0;
  provider.retryConnectionAt = Date.now() - 1;
  await provider.tools();
  assert.equal(provider.profileStatus.ok, false, 'sama lista narzędzi nie oznacza dostępności profili');
  assert.equal((await provider.summoner(person)).profileSource.retry, false);
  assert.equal(state.opens, 3);
  assert.equal(provider.profileStatus.ok, true);
});

test('błąd tylko historii nie odnawia sesji ani nie przedstawia częściowego profilu jako pełnego', async t => {
  const {state, provider} = await service(t);
  state.historyFailure = true;
  const person = player('Partial');
  const partial = await provider.summoner(person);
  assert.equal(partial.rank.tier, 'EMERALD');
  assert.equal(partial.profileSource.historyMissing, true);
  assert.equal(provider.profileStatus.ok, false);
  assert.match(provider.profileStatus.message, /niepełny odczyt/);
  assert.equal(state.opens, 1);
  state.historyFailure = false;
  const complete = await provider.summoner(person);
  assert.equal(complete.games.length, 2);
  assert.equal(provider.profileStatus.ok, true);
  assert.equal(state.opens, 1);
});
