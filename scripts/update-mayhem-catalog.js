// Publiczne metadane Riot wyodrębnione przez CommunityDragon. Bez danych graczy.
// node scripts/update-mayhem-catalog.js [folder plików z danego patcha lub -] [patch klienta]
const fs = require('fs');
const path = require('path');
const patch = process.argv[3] || '16.23';
if (!/^\d+\.\d+$/.test(patch)) throw Error('Podaj patch klienta, np. 16.23.');
const base = `https://raw.communitydragon.org/${patch}/plugins/rcp-be-lol-game-data/global/`;
const output = path.join(__dirname, '../data/mayhem-augments.json');
const sources = {
  lists: [base + 'default/v1/augment-lists.json', 'augment-lists.json'],
  en: [base + 'default/v1/cherry-augments.json', 'cherry-augments.json'],
  pl: [base + 'pl_pl/v1/cherry-augments.json', 'augments-pl.json'],
};
async function main() {
  const loaded = {};
  for (const [key, [url, file]] of Object.entries(sources)) {
    if (process.argv[2] && process.argv[2] !== '-') loaded[key] = JSON.parse(fs.readFileSync(path.join(process.argv[2], file), 'utf8'));
    else { const response = await fetch(url); if (!response.ok) throw Error(`${response.status}: ${url}`); loaded[key] = await response.json(); }
  }
  const augments = new Map();
  for (const pool of ['KIWI', 'KIWI_JADE']) {
    const list = loaded.lists.find(l => l.modeName === pool);
    if (!list?.augmentList?.length) throw Error(`Brak listy dla ${pool}.`);
    for (const ref of list.augmentList) {
      const api = ref.split('/').pop(), en = loaded.en.find(a => a.augmentNameId === api);
      if (!en) throw Error(`Brak metadanych: ${api}`);
      if (!en.nameTRA.trim()) continue;
      const pl = loaded.pl.find(a => a.id === en.id);
      const entry = augments.get(en.id) || { id: en.id, api, name: pl?.nameTRA?.trim() || en.nameTRA, english: en.nameTRA,
        rarity: en.rarity, icon: en.augmentSmallIconPath, pools: [] };
      entry.pools.push(list.modeName); augments.set(en.id, entry);
    }
  }
  // Saved matches and favourites can still refer to cards removed from both pools.
  for (const old of JSON.parse(fs.readFileSync(output, 'utf8')).augments) {
    if (!augments.has(old.id)) augments.set(old.id, { ...old, pools: [] });
  }
  const result = { schema: 1, patch, fetched: new Date().toISOString().slice(0,10), sources: Object.values(sources).map(x => x[0]),
    augments: [...augments.values()].sort((a,b) => a.id - b.id) };
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(`Mayhem ${patch}: ${result.augments.filter(a => a.pools.length).length} aktywnych augmentów`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
