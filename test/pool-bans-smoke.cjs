// Run an anonymous draft against the mock LCU and the real Electron renderer.
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LcuClient } = require('../src/lcu');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'csa-pool-bans-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  stats:false, autoRunes:false, autoItemSet:false, autoPopup:false, launchAtLogin:false, keyboardShortcut:'',
}));
fs.writeFileSync(path.join(profile, 'pick-pools.json'), JSON.stringify({
  bottom:{ aliases:['Jinx','Caitlyn','Ezreal'] },
}));
process.argv.push('--background');
process.env.PORT = '0';
process.env.STEP = '5';
const server = require('../mock/mock-lcu');
const get = LcuClient.prototype.get;
let declareDraven = false, dravenId, win;
LcuClient.prototype.get = async function(url) {
  const data = await get.call(this, url);
  if (url.endsWith('/champion-summary.json')) dravenId = data.find(c => c.alias === 'Draven').id;
  if (url === '/lol-champ-select/v1/session' && data) {
    const me = data.myTeam.find(p => p.cellId === data.localPlayerCellId);
    me.assignedPosition = 'bottom';
    me.championPickIntent = 0;
    const ally = data.myTeam.find(p => p.cellId === 3);
    ally.assignedPosition = 'middle';
    ally.championPickIntent = declareDraven ? dravenId : 0;
  }
  return data;
};
app.on('browser-window-created', (_event, window) => {
  win = window;
  win.setPosition(-30000, -30000);
  win.show = () => {};
  win.focus = () => {};
  win.webContents.setBackgroundThrottling(false);
});
const evaluate = code => win.webContents.executeJavaScript(code);
async function waitFor(code) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (win && !win.webContents.isLoading() && await evaluate(code)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Timed out waiting for ' + code);
}
server.once('listening', async () => {
  process.env.LCU_MOCK = 'http://127.0.0.1:' + server.address().port;
  require('../src/main');
  try {
    await waitFor("!!document.querySelector('[data-pool-foe=Draven]')");
    assert.equal(await evaluate('!!lastState.myChampion'), false);
    assert.equal(await evaluate("lastState.pickPool.bans.common.find(c=>c.alias==='Draven').pairs.every(p=>p.result==='bad')"), true);
    await evaluate(`(() => {
      const second = document.querySelector('[data-pool-side="1"]');
      second.value = 'Ezreal';
      second.dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    await waitFor("lastState.pickPool.bans.covered.some(c=>c.alias==='Draven')");
    assert.ok(await evaluate("document.querySelector('[data-pool-foe=Draven]').closest('details').textContent.includes('Ezreal · korzystny')"));
    declareDraven = true;
    await waitFor("!document.querySelector('[data-pool-foe=Draven]') && !!document.querySelector('[data-pool-bans]')");
    await fetch(process.env.LCU_MOCK + '/__step?n=0');
    await waitFor("!document.querySelector('[data-pool-bans]') && !!document.querySelector('[data-pool-card=Ezreal]')");
    console.log('PASS: SoloQ ban without a hover, pair selection, covered opponent, allied intent and switch to pick phase.');
    server.close();
    win.destroy();
    app.quit();
  } catch (err) {
    console.error(err);
    server.close();
    app.exit(1);
  }
});
