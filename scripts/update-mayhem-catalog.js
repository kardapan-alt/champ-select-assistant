// Publiczne metadane Riot wyodrębnione przez CommunityDragon. Bez danych graczy.
// node scripts/update-mayhem-catalog.js [folder wcześniej pobranych plików]
const fs = require('fs');
const path = require('path');
const base = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/';
const sources = {
  lists: [base + 'default/v1/augment-lists.json', 'augment-lists.json'],
  en: [base + 'default/v1/cherry-augments.json', 'cherry-augments.json'],
  pl: [base + 'pl_pl/v1/cherry-augments.json', 'augments-pl.json'],
};
async function main() {
  const loaded = {};
  for (const [key, [url, file]] of Object.entries(sources)) {
    if (process.argv[2]) loaded[key] = JSON.parse(fs.readFileSync(path.join(process.argv[2], file), 'utf8'));
    else { const response = await fetch(url); if (!response.ok) throw Error(`${response.status}: ${url}`); loaded[key] = await response.json(); }
  }
  const augments = new Map();
  for (const list of loaded.lists.filter(l => ['KIWI', 'KIWI_JADE'].includes(l.modeName))) {
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
  const result = { schema: 1, fetched: new Date().toISOString().slice(0,10), sources: Object.values(sources).map(x => x[0]),
    augments: [...augments.values()].sort((a,b) => a.id - b.id) };
  fs.writeFileSync(path.join(__dirname,'../data/mayhem-augments.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`Mayhem: ${result.augments.length} augmentów w katalogu`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
