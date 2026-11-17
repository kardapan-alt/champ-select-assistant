// Drive two mock SoloQ games through the actual renderer, main process and LiveClient parser.
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LcuClient } = require('../src/lcu');
const { LiveClient } = require('../src/liveclient');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'csa-soloq-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  stats:false, autoRunes:false, autoItemSet:false, autoPopup:false, launchAtLogin:false, keyboardShortcut:'',
}));
process.argv.push('--background');
process.env.PORT = '0';
process.env.STEP = '0';
const server = require('../mock/mock-lcu');
let gameId = 777;
let gameTime = 597;
let creepScore = 55;
let win;
const get = LcuClient.prototype.get;
LcuClient.prototype.get = async function(url) {
  const result = await get.call(this, url);
  if (url === '/lol-gameflow/v1/session' && result) result.gameData.gameId = gameId;
  return result;
};
const readInventory = LiveClient.prototype.inventory;
LiveClient.prototype.inventory = function(...args) {
  this.read = async () => {
    const time = gameTime;
    if (time===601) gameTime=625;
    return {
      activePlayer: {riotId:'Daniel#EUNE',currentGold:100},
      allPlayers: [{riotId:'Daniel#EUNE',rawChampionName:'game_character_displayname_Ahri',
        position:'MIDDLE',team:'ORDER',items:[],scores:{creepScore,wardScore:3.25}}],
      gameData: {gameMode:'CLASSIC',gameTime:time},
    };
  };
  return readInventory.apply(this, args);
};
app.on('browser-window-created', (_event, window) => {
  win = window;
  win.setPosition(-30000,-30000);
  win.show = () => {};
  win.focus = () => {};
  win.webContents.setBackgroundThrottling(false);
});
const evaluate = code => win.webContents.executeJavaScript(code);
async function waitFor(condition) {
  const end = Date.now()+18000;
  while (Date.now()<end) {
    if (win && !win.webContents.isLoading() && await evaluate(condition)) return;
    await new Promise(resolve => setTimeout(resolve,100));
  }
  throw Error('Timed out: '+condition);
}
const step = n => fetch(process.env.LCU_MOCK+'/__step?n='+n);
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const select = (selector,value) => evaluate(`(() => {
  const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};
  el.dispatchEvent(new Event('change',{bubbles:true}));
})()`);

async function configurePool() {
  await click('[data-pool-edit]');
  await waitFor("document.querySelector('#pick-pool-dialog')?.open && !document.querySelector('[data-pool-add]').disabled");
  await select('[data-pool-role]','middle');
  for (const alias of ['Ahri','Orianna']) {
    await select('[data-pool-add-alias]', alias);
    await click('[data-pool-add]');
    await waitFor(`!!document.querySelector('[data-pool-remove="${alias}"]')`);
  }
  await evaluate("document.getElementById('pick-pool-dialog').close()");
  await waitFor("document.querySelectorAll('[data-pool-card]').length===2");
  const cards = await evaluate("Array.from(document.querySelectorAll('[data-pool-card]'),c=>c.innerText)");
  assert.ok(cards.some(c=>c.includes('Ahri')) && cards.some(c=>c.includes('Orianna')));
}

async function playGame(cs, target) {
  await waitFor("typeof lastState !== 'undefined' && lastState?.status==='champselect' && !!document.querySelector('[data-training-form]')");
  if (gameId===777) await configurePool();
  await select('[data-training-metric]', 'cs10');
  await evaluate(`(() => {const el=document.querySelector('[data-training-target]');el.value='${target}';
    el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-training-form]').requestSubmit();})()`);
  await waitFor(`lastState?.training?.target===${target} && document.querySelector('[data-training-saved]').innerText.includes('${target}')`);
  await step(3);
  await waitFor("lastState?.myChampion?.locked");
  gameTime=597;
  creepScore=cs-1;
  await step(6);
  await waitFor("lastState?.status==='loading-screen' && lastState.final?.build?.shop?.gold===100");
  if (gameId===778) await waitFor("document.querySelector('[data-matchup-reminders]')?.innerText.includes('Zachowaj E')");
  gameTime=601;
  creepScore=cs;
  // Await the real recorder. Changing the game phase before it samples would
  // accurately produce a missing result and would not exercise the measurement.
  const end = Date.now()+16000;
  const historyFile = path.join(profile,'match-review.json');
  let sampled = false;
  while (Date.now()<end) {
    if (fs.existsSync(historyFile) && JSON.parse(fs.readFileSync(historyFile)).active?.duration>=600) {
      sampled=true; break;
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(sampled, 'Missing measurement tick');
  await step(-1);
  await waitFor("lastState?.status==='idle'");
  await click('#match-history');
  await waitFor(`document.querySelector('[data-training-result]')?.innerText.includes('${cs}')`);
  return evaluate("document.querySelector('[data-training-result]').innerText");
}

server.once('listening',async()=>{
  process.env.LCU_MOCK='http://127.0.0.1:'+server.address().port;
  require('../src/main');
  try {
    await playGame(68,70);
    await click('[data-open-matchup-notes]');
    await waitFor("!!document.querySelector('[data-note-context] option')");
    await evaluate("document.querySelector('[data-note-text]').value='Zachowaj E przy wejściu Zeda';document.querySelector('[data-note-save]').click()");
    await waitFor("document.querySelector('#matchup-notes-dialog [role=status]')?.innerText.includes('Zapisano')");
    await click('[data-close-notes]');
    await click('[data-close-review]');
    gameId++;
    await step(0);
    const second = await playGame(74,72);
    assert.ok(second.includes('68'), 'Missing personal median from the first match');
    await click('[data-open-matchup-notes]');
    await waitFor("document.querySelector('[data-note-text]')?.value.includes('Zachowaj E')");
    await click('[data-note-remove]');
    await waitFor("document.querySelector('#matchup-notes-dialog [role=status]')?.innerText.includes('Usunięto')");
    await click('[data-close-notes]');
    await click('[data-close-review]');
    console.log('PASS: two picks, SoloQ goals with CS and median, post-game matchup note saved, recalled in the next match and removed.');
    server.close();win.destroy();app.quit();
  } catch (err) {
    console.error(err);
    server.close();app.exit(1);
  }
});
