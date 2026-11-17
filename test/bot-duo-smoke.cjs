// Exercise the draft and loading renderers with the same four visible picks.
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LcuClient } = require('../src/lcu');
const { LiveClient } = require('../src/liveclient');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'csa-bot-duo-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  stats: false, autoRunes: false, autoItemSet: false, autoPopup: false, launchAtLogin: false, keyboardShortcut: '',
}));
process.argv.push('--background');
process.env.PORT = '0';
process.env.STEP = '3';
const server = require('../mock/mock-lcu');
const ids = new Map(Object.keys(require('../data/champions.json').champions).map((alias, index) => [alias, index + 1]));
let revealLux = false;
let queueId = 420;
let win;
LiveClient.prototype.inventory = async () => ({ status: 'waiting' });
const originalGet = LcuClient.prototype.get;
LcuClient.prototype.get = async function (url) {
  const result = await originalGet.call(this, url);
  if (result && url === '/lol-champ-select/v1/session') {
    result.localPlayerCellId = 3;
    result.myTeam[3].championId = ids.get('Xayah');
    result.myTeam[4].championId = ids.get('Leona');
    result.theirTeam[3].assignedPosition = 'bottom';
    Object.assign(result.theirTeam[4], { assignedPosition: 'utility', championId: revealLux ? ids.get('Lux') : 0 });
    for (const action of result.actions.flat().filter(a => a.type === 'pick')) {
      const player = [...result.myTeam, ...result.theirTeam].find(p => p.cellId === action.actorCellId);
      Object.assign(action, { championId: player.championId, completed: player.championId > 0 });
    }
  }
  if (result && url === '/lol-gameflow/v1/session') {
    const { teamOne, teamTwo, queue } = result.gameData;
    queue.id = queueId;
    teamOne[2].championId = ids.get('Xayah');
    // Loading may omit the local player's and partner's roles from this draft.
    teamOne[2].selectedPosition = '';
    teamOne[3].championId = ids.get('Ahri');
    teamOne[3].selectedPosition = 'MIDDLE';
    teamOne[4].championId = ids.get('Leona');
    teamOne[4].selectedPosition = '';
    teamTwo[4].championId = ids.get('Lux');
  }
  return result;
};
app.on('browser-window-created', (_event, window) => {
  win = window;
  win.setPosition(-30000, -30000);
  win.show = () => {};
  win.focus = () => {};
  win.webContents.setBackgroundThrottling(false);
});

async function waitFor(expression) {
  const deadline = Date.now() + 15000;
  do {
    if (win && !win.webContents.isLoading() && await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw Error('Timed out waiting for ' + expression);
}

server.once('listening', async () => {
  process.env.LCU_MOCK = 'http://127.0.0.1:' + server.address().port;
  const step = n => fetch(process.env.LCU_MOCK + '/__step?n=' + n);
  const plan = "document.querySelector('[data-bot-duo]')";
  require('../src/main');
  try {
    await waitFor("typeof lastState !== 'undefined' && lastState?.status === 'champselect'");
    assert.equal(await win.webContents.executeJavaScript(`!!${plan}`), false, 'Hidden support entered the plan');
    revealLux = true;
    const fourNames = `['Xayah','Leona','Caitlyn','Lux'].every(name => ${plan}?.innerText.includes(name))`;
    await waitFor(fourNames);
    await step(6);
    await waitFor(`lastState?.status === 'loading-screen' && ${fourNames}`);
    await step(-1);
    await waitFor("lastState?.status === 'idle'");
    queueId = 440;
    await step(3);
    await waitFor("lastState?.status === 'champselect'");
    assert.equal(await win.webContents.executeJavaScript(`!!${plan}`), false, 'SoloQ plan appeared in ranked flex');
    console.log('PASS: hidden pick, full SoloQ draft, loading overview, ranked flex.');
    server.close();
    win.destroy();
    app.quit();
  } catch (error) {
    console.error(error);
    server.close();
    app.exit(1);
  }
});
