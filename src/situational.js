// Sytuacje w konkretnym składzie wroga: kto dokładnie stwarza problem i czym na to odpowiedzieć,
// np. "Yasuo i Jhin opierają się na krytach → Randuin's Omen", "Soraka się leczy → antyleczenie".
// Itemy są podane dla każdej puli (mage, adc, fighter, assassin, tank, support); pierwszy istniejący w patchu wygrywa.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const SITUATIONS = [
  {
    key: 'crit',
    short: 'kryty',
    champions: ['Yasuo', 'Yone', 'Tryndamere', 'Jhin', 'Caitlyn', 'Jinx', 'Draven', 'Aphelios', 'Samira', 'Xayah', 'Nilah', 'Gangplank', 'MasterYi', 'Tristana', 'Zeri', 'Ashe', 'Smolder', 'Yunara', 'Kindred'],
    // Od 2 championów na krytach item jest wart slotu, 1 to tylko wskazówka.
    levels: [1, 2],
    problem: (names, many) => `${names} ${many ? 'opierają' : 'opiera'} się na krytach`,
    answer: 'Randuin\'s Omen zmniejsza obrażenia krytyczne i spowalnia ich ataki.',
    items: { tank: [3143], fighter: [3143], support: [], mage: [], adc: [], assassin: [] },
    general: 3143,
    owner: 'tank albo bruiser',
  },
  {
    key: 'onhit',
    short: 'szybkie ataki',
    champions: ['Vayne', 'KogMaw', 'Kalista', 'Varus', 'Jax', 'MasterYi', 'Kayle', 'Twitch', 'Belveth', 'Zeri', 'Kaisa', 'Nilah', 'Viego', 'Gwen', 'Fiora', 'Yunara', 'Ashe', 'Jinx', 'Warwick', 'Shyvana'],
    levels: [2, 3],
    problem: (names) => `${names} zadają obrażenia szybkimi atakami`,
    answer: 'Frozen Heart spowalnia ich ataki; Plated Steelcaps zmniejszają obrażenia z ataków.',
    items: { tank: [3110], fighter: [3742, 3110], support: [], mage: [3157], adc: [], assassin: [] },
    general: 3110,
    owner: 'tank',
  },
  {
    key: 'heal',
    short: 'leczenie',
    champions: ['Aatrox', 'Soraka', 'Yuumi', 'Warwick', 'Vladimir', 'Sylas', 'Fiddlesticks', 'Swain', 'DrMundo', 'Nami', 'Sona', 'Briar', 'Illaoi', 'Olaf', 'Volibear', 'Maokai', 'Seraphine', 'Milio', 'Viego', 'Gwen', 'Trundle', 'Kayn', 'Taric', 'Zac', 'Senna', 'Renata'],
    // Najmocniej leczący: wystarczy jeden, żeby antyleczenie było obowiązkowe.
    heavy: ['Soraka', 'Yuumi', 'Aatrox', 'Vladimir', 'DrMundo', 'Warwick', 'Sylas', 'Fiddlesticks', 'Swain', 'Briar', 'Illaoi'],
    levels: [1, 2],
    problem: (names, many) => `${names} ${many ? 'leczą' : 'leczy'} się w walce`,
    answer: 'Antyleczenie (Grievous Wounds) obcina ich leczenie o 40%. Kupcie je wcześnie, choćby jako komponent.',
    items: { tank: [3075], fighter: [6609, 3123], assassin: [6609, 3123], adc: [3033, 3123], mage: [3165, 3916], support: [3011, 3916] },
    general: 3075,
    owner: 'tank; strzelec: Mortal Reminder, mag: Morellonomicon',
  },
  {
    key: 'shields',
    short: 'tarcze',
    champions: ['Lulu', 'Janna', 'Karma', 'Seraphine', 'Sett', 'Lux', 'Ivern', 'Orianna', 'Milio', 'Rakan', 'Mordekaiser', 'Diana', 'Rumble', 'TahmKench', 'Taric', 'Nautilus', 'Riven', 'Camille', 'Sona', 'Renata', 'Shen', 'Skarner', 'Rell'],
    levels: [2, 3],
    problem: (names) => `${names} dają sobie albo sojusznikom tarcze`,
    answer: 'Serpent\'s Fang osłabia tarcze. Grajcie dłuższe walki, zamiast wchodzić w tarczę.',
    items: { assassin: [6695], fighter: [], adc: [], mage: [], tank: [], support: [] },
    general: 6695,
    owner: 'zabójca AD',
  },
  {
    key: 'suppress',
    short: 'supresja',
    champions: ['Malzahar', 'Skarner', 'Warwick', 'Urgot', 'Mordekaiser'],
    levels: [1, 1],
    problem: (names, many) => `${names} ${many ? 'mają ulty, które łapią' : 'ma ulta, który łapie'} jedną osobę bez ucieczki`,
    answer: 'Quicksilver Sash / Mercurial Scimitar zdejmuje supresję, Banshee\'s Veil blokuje pierwszy czar.',
    items: { adc: [3139, 3140], mage: [3102], support: [3222], fighter: [], assassin: [], tank: [] },
    general: 3139,
    owner: 'strzelec',
  },
  {
    key: 'apburst',
    short: 'burst AP',
    champions: ['Syndra', 'Veigar', 'Leblanc', 'Fizz', 'Annie', 'Brand', 'Evelynn', 'Diana', 'Katarina', 'Akali', 'Ahri', 'Vex', 'Lux', 'Zoe', 'Elise', 'Kennen', 'Xerath', 'Velkoz', 'Kassadin', 'Hwei', 'Aurora', 'Mel', 'Neeko', 'Ekko', 'Kayle', 'Nidalee', 'Rumble', 'Lissandra'],
    levels: [2, 3],
    problem: (names) => `${names} zabijają magicznym burstem`,
    answer: 'Item z tarczą przeciw magii (Banshee\'s Veil, Maw of Malmortius) albo Force of Nature dla tanka.',
    items: { mage: [3102], fighter: [3156], adc: [3156], assassin: [3814, 3156], tank: [4401, 2504], support: [3222] },
    general: 3102,
    owner: 'mag',
  },
  {
    key: 'adburst',
    short: 'zabójcy AD',
    champions: ['Zed', 'Talon', 'Qiyana', 'Rengar', 'Khazix', 'Pyke', 'Naafiri', 'Kayn', 'Nocturne', 'Graves', 'Shaco', 'MonkeyKing', 'KSante'],
    levels: [1, 2],
    problem: (names, many) => `${names} ${many ? 'wskakują' : 'wskakuje'} na najsłabszych i zabija ich w sekundę`,
    answer: 'Zhonya\'s Hourglass dla maga, Guardian Angel / Death\'s Dance dla strzelca i bruisera, Plated Steelcaps dla wszystkich.',
    items: { mage: [3157], adc: [3026, 6673], fighter: [6333, 3053], assassin: [3814], tank: [], support: [3190] },
    general: 3157,
    owner: 'mag',
  },
  {
    key: 'tanks',
    short: 'tanki',
    // Tanki rozpoznajemy po cechach championów w danych (cecha "tank"), lista to tylko uzupełnienie.
    champions: ['Ornn', 'Malphite', 'Sion', 'Maokai', 'Chogath', 'Zac', 'Sejuani', 'Rammus', 'Leona', 'Nautilus', 'Alistar', 'Braum', 'TahmKench', 'KSante', 'Poppy', 'DrMundo', 'Shen', 'Galio', 'Amumu', 'Rell', 'Skarner', 'JarvanIV', 'Nunu', 'Taric', 'Thresh', 'Singed'],
    byTrait: 'tank',
    levels: [2, 3],
    problem: (names) => `${names} to tanki`,
    answer: 'Przebicie pancerza / odporności na magię (Void Staff, Lord Dominik\'s, Black Cleaver) albo procentowe obrażenia (Liandry\'s, Blade of the Ruined King).',
    items: { mage: [3135, 6653], adc: [3036, 3153], fighter: [3071, 3153], assassin: [], tank: [], support: [] },
    general: 3036,
    owner: 'strzelec i mag',
  },
  {
    key: 'stealth',
    short: 'niewidzialność',
    champions: ['Evelynn', 'Akali', 'Twitch', 'Shaco', 'Pyke', 'Khazix', 'Rengar', 'Vayne', 'Talon', 'MonkeyKing', 'Senna', 'Teemo', 'Neeko', 'Wukong'],
    levels: [1, 2],
    problem: (names, many) => `${names} ${many ? 'stają' : 'staje'} się niewidzialni`,
    answer: 'Control Ward w kluczowych miejscach i Oracle Lens po pierwszym powrocie (support albo jungler).',
    items: {},
    general: 3364,
    owner: 'support albo jungler',
    vision: true,
  },
];

// "Yasuo i Jhin", "Yasuo, Yone i Jhin"
function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} i ${names[names.length - 1]}`;
}

// enemies: [{ alias, championId, name, traits }]; poolKey: pula itemów gracza (mage/adc/fighter/assassin/tank/support).
// Zwraca sytuacje od najważniejszej: level 2 = item wart miejsca w buildzie, level 1 = wskazówka.
function detectSituations(enemies, poolKey, exists = () => true) {
  const out = [];
  for (const s of SITUATIONS) {
    const set = new Set(s.champions.map(norm));
    const who = enemies.filter((e) => set.has(norm(e.alias)) || (s.byTrait && (e.traits || []).includes(s.byTrait)));
    if (!who.length) continue;
    const heavy = s.heavy ? who.filter((e) => s.heavy.map(norm).includes(norm(e.alias))).length : 0;
    const weight = who.length + heavy;
    const [hint, strong] = s.levels;
    if (weight < hint) continue;
    const level = weight >= strong ? 2 : 1;
    const myItem = ((s.items || {})[poolKey] || []).find(exists) || null;
    out.push({
      key: s.key,
      short: s.short,
      level,
      weight,
      champions: who.map((e) => ({ alias: e.alias, championId: e.championId, name: e.name || e.alias })),
      text: s.problem(joinNames(who.map((e) => e.name || e.alias)), who.length > 1),
      answer: s.answer,
      myItem,
      general: exists(s.general) ? s.general : null,
      owner: s.owner,
      vision: !!s.vision,
    });
  }
  return out.sort((a, b) => b.level - a.level || b.weight - a.weight);
}

// Krótki powód przy itemie: "kryty: Yasuo, Jhin".
const reasonFor = (s) => `${s.short}: ${s.champions.map((c) => c.name).join(', ')}`;

// Sytuacja do wyświetlenia: ikony championów wroga i item-odpowiedź (Twój albo ogólny dla drużyny).
function situationView(s, game, inBuild = []) {
  const id = s.myItem || s.general;
  const it = id ? game.items.get(id) : null;
  return {
    key: s.key,
    level: s.level,
    text: s.text,
    answer: s.answer,
    champions: s.champions.map((c) => ({ id: c.championId, name: c.name, icon: `/lol-game-data/assets/v1/champion-icons/${c.championId}.png` })),
    item: id ? { id, name: it ? it.name : String(id), icon: it ? it.iconPath : '', mine: !!s.myItem, inBuild: inBuild.includes(id), owner: s.myItem ? '' : s.owner } : null,
  };
}

module.exports = { SITUATIONS, detectSituations, situationView, reasonFor, joinNames };
