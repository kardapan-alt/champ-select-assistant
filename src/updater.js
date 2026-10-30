// Aktualizacje z wydań na GitHubie.
// Wersja z instalatorem aktualizuje się sama: pobiera nową wersję w tle i instaluje ją przy zamknięciu albo na kliknięcie.
// Wersja przenośna (portable) nie może podmienić sama siebie, więc tylko informuje o nowej wersji i otwiera stronę pobierania.
const https = require('https');
const { app, shell } = require('electron');

const REPO = 'kardapan-alt/champ-select-assistant';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const CHECK_EVERY = 6 * 60 * 60 * 1000;

// Czy wersja a jest nowsza od b (format 1.2.3).
function isNewer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

function latestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'champ-select-assistant', Accept: 'application/vnd.github+json' } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`GitHub ${res.statusCode}`));
        try {
          const r = JSON.parse(body);
          resolve({ version: String(r.tag_name || '').replace(/^v/, ''), url: r.html_url || RELEASES_PAGE });
        } catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

// notify(update) dostaje { state: 'available' | 'ready', version, portable }.
function initUpdates(notify, log = () => {}) {
  const actions = { install: () => {}, openPage: () => shell.openExternal(RELEASES_PAGE) };
  if (!app.isPackaged) return actions;

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const check = () => latestRelease()
      .then((r) => { if (r.version && isNewer(r.version, app.getVersion())) notify({ state: 'available', version: r.version, portable: true }); })
      .catch((err) => log(`aktualizacje: ${err.message}`));
    setTimeout(check, 5000);
    setInterval(check, CHECK_EVERY);
    return actions;
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => notify({ state: 'ready', version: info.version, portable: false }));
  autoUpdater.on('error', (err) => log(`aktualizacje: ${err.message}`));
  const check = () => autoUpdater.checkForUpdates().catch((err) => log(`aktualizacje: ${err.message}`));
  setTimeout(check, 5000);
  setInterval(check, CHECK_EVERY);
  actions.install = () => autoUpdater.quitAndInstall();
  return actions;
}

module.exports = { initUpdates, isNewer };
