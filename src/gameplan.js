// Plan na całą grę na ekranie ładowania: jak grać na początku, w środku gry i w walkach drużynowych.
// Opiera się na stylu obu składów (archetypy), sile na początku / w późnej grze i statystykach graczy z kart.
const engine = require('./engine');

const { champInfo } = engine;

const toDataRole = (pos) => ({ utility: 'support', mid: 'middle', adc: 'bottom', bot: 'bottom' }[pos] || pos || '');

// Jak grać własnym stylem składu (środek gry).
const OWN_STYLE = {
  dive: (who) => `Wasz skład to dive: wchodźcie razem na carry wroga${who ? ` (inicjuje ${who})` : ''}, gdy ich CC jest zużyte.`,
  engage: (who) => `Wasz skład wygrywa walki 5 na 5: szukajcie walk przy smoku i Baronie${who ? `, engage od ${who}` : ''}.`,
  poke: () => 'Wasz skład pokuje: osłabiajcie ich przed walką, oblegajcie wieże i nie wchodźcie, póki mają pełne HP.',
  protect: (who) => `Grajcie wokół ${who || 'swojego carry'}: trzymajcie się przy nim i chrońcie go w walkach.`,
  pick: () => 'Łapcie pojedynczych przeciwników: wardy w ich jungli, zasadzki w krzakach przed obiektami.',
  split: (who) => `${who || 'Wasz splitpusher'} na bocznej linii, reszta grozi obiektem po drugiej stronie mapy.`,
};

// Jak grać przeciw stylowi wroga (walki drużynowe).
const VS_STYLE = {
  dive: (who) => `Wróg robi dive${who ? ` (${who})` : ''}: stójcie blisko swojego carry i zostawcie CC na wchodzących.`,
  engage: (who) => `Wróg ma mocny engage${who ? ` (${who})` : ''}: unikajcie wąskich przejść i walczcie, gdy jego engage jest na odnowieniu.`,
  poke: () => 'Wróg pokuje: nie stójcie pod ich wieżą, wchodźcie w walkę szybko albo odpuśćcie obiekt.',
  protect: (who) => `Wróg chroni ${who || 'swojego carry'}: łapcie go poza grupą albo najpierw zabijcie jego obrońców.`,
  pick: () => 'Wróg łapie pojedynczych graczy: chodźcie grupą i nie wardujcie samotnie po ich stronie mapy.',
  split: (who) => `${who || 'Ich splitpusher'} będzie na bocznej linii: niech pilnuje go jedna osoba, nie walczcie 4 na 5 bez powodu.`,
};

function teamOf(players, game, data) {
  return players.filter((p) => p.championId).map((p) => {
    const alias = game.championsById.get(p.championId)?.alias;
    const info = alias ? champInfo(alias, game, data) : null;
    return info ? { player: p, info, name: game.championsByAlias.get(alias)?.name || alias } : null;
  }).filter(Boolean);
}

const count = (team, trait) => team.filter((m) => (m.info.traits || []).includes(trait)).length;
// Siła na początku minus skalowanie: dodatnia = skład mocny wcześnie.
const tempo = (team) => count(team, 'early') + count(team, 'snowball') - count(team, 'scaling');

// Kto w składzie pełni daną rolę (pierwszy pasujący champion).
// Cechy w kolejności ważności: najpierw szukamy championa z pierwszą z nich.
function whoHas(team, traits) {
  for (const t of traits) {
    const m = team.find((x) => (x.info.traits || []).includes(t));
    if (m) return m.name;
  }
  return '';
}
function carryOf(team) {
  const m = team.find((x) => x.info.class === 'adc') || team.find((x) => (x.info.traits || []).includes('scaling'));
  return m ? m.name : '';
}
function whoFor(style, team) {
  if (style === 'dive') return whoHas(team, ['dive', 'engage']);
  if (style === 'engage') return whoHas(team, ['engage', 'dive']);
  if (style === 'protect') return carryOf(team);
  if (style === 'split') return whoHas(team, ['splitpush']);
  return '';
}

// Na kogo uważać i kto jest słabym punktem wroga: z tagów i liczb na kartach graczy.
function playersToWatch(enemies, cardFor, game) {
  const threats = [];
  const targets = [];
  for (const p of enemies) {
    const card = cardFor ? cardFor(p) : null;
    if (!card || !card.loaded) continue;
    const champ = game.championsById.get(p.championId)?.name || '';
    const who = `${p.gameName || 'Gracz'}${champ ? ` (${champ})` : ''}`;
    const tags = card.tags.map((t) => t.text);
    const c = card.champion || {};
    const otp = tags.find((t) => t.startsWith('OTP') || t.startsWith('Doświadczony'));
    // Waga: doświadczenie na championie liczy się bardziej niż dobra seria.
    if (otp) threats.push({ who, why: otp.startsWith('OTP') ? 'gra prawie tylko tym championem' : `${c.seasonGames} gier tym championem w sezonie`, weight: 3 });
    else if (c.seasonGames >= 20 && c.seasonWinRate >= 58) threats.push({ who, why: `${c.seasonWinRate}% wygranych tym championem`, weight: 2 });
    else if (card.recent && card.recent.games >= 10 && card.recent.winRate >= 65) threats.push({ who, why: `wygrywa ${card.recent.winRate}% ostatnich gier`, weight: 1 });

    const streak = tags.find((t) => t.startsWith('Seria') && t.includes('porażek'));
    if (tags.includes('Mało gier tym championem')) targets.push({ who, why: 'mało gier tym championem' });
    else if (tags.includes('Gra poza swoją rolą')) targets.push({ who, why: 'zwykle gra inną rolę' });
    else if (streak) targets.push({ who, why: streak.toLowerCase() });
  }
  threats.sort((a, b) => b.weight - a.weight);
  return { threats: threats.slice(0, 2).map(({ who, why }) => ({ who, why })), targets: targets.slice(0, 2) };
}

function gamePlan(allies, enemies, cardFor, game, data) {
  const ours = teamOf(allies, game, data);
  const theirs = teamOf(enemies, game, data);
  if (!ours.length || !theirs.length) return null;
  const ourStyle = engine.archetypeOf(ours.map((m) => m.info));
  const theirStyle = engine.archetypeOf(theirs.map((m) => m.info));

  // Początek gry: kto jest mocniejszy wcześnie i jungle.
  const early = [];
  const diff = tempo(ours) - tempo(theirs);
  if (diff >= 2) early.push('Jesteście mocniejsi na początku: walczcie o pierwsze smoki i Void Grubs, pomagajcie liniom, które wygrywają.');
  else if (diff <= -2) early.push('Przeciwnicy są mocniejsi na początku: nie forsujcie pierwszych obiektów, farmcie i czekajcie na itemy.');
  else early.push('Siła na początku jest wyrównana: wygra ten, kto pierwszy wygra linię i dostanie pomoc junglera.');
  const jungle = (team) => team.find((m) => toDataRole(m.player.position) === 'jungle') || team.find((m) => (m.info.roles || [])[0] === 'jungle');
  const ourJg = jungle(ours);
  const theirJg = jungle(theirs);
  const jt = (m) => (m ? m.info.traits || [] : []);
  if (ourJg && (jt(ourJg).includes('early') || jt(ourJg).includes('pick'))) early.push(`Wasz jungler (${ourJg.name}) jest groźny wcześnie: pushujcie fale, gdy jest w pobliżu, i idźcie za nim do rzeki.`);
  // Groźnego wcześnie junglera wroga opisuje już plan na linię.
  if (theirJg && jt(theirJg).includes('scaling')) early.push(`Ich jungler (${theirJg.name}) potrzebuje czasu: inwadujcie i odbierajcie mu obozy, gdy macie przewagę na liniach.`);

  // Środek gry: własny styl.
  const mid = [];
  if (ourStyle) mid.push(OWN_STYLE[ourStyle.primary](whoFor(ourStyle.primary, ours)));
  else mid.push('Brak wyraźnego stylu: grajcie wokół linii, która najlepiej idzie, i wokół obiektów.');
  const lateDiff = count(ours, 'scaling') - count(theirs, 'scaling');
  if (lateDiff >= 2) mid.push('Późna gra należy do was: nie ryzykujcie walk przed 2–3 itemami, oddawajcie mniejsze obiekty zamiast walk na straconej pozycji.');
  else if (lateDiff <= -2) mid.push('Wróg skaluje lepiej: wykorzystajcie przewagę wcześnie, grajcie o Barona i kończcie grę, zanim się rozkręcą.');

  // Walki drużynowe: przeciw stylowi wroga i typowi obrażeń.
  const late = [];
  if (theirStyle) late.push(VS_STYLE[theirStyle.primary](whoFor(theirStyle.primary, theirs)));
  const profile = engine.describeEnemy(engine.teamProfile(theirs.map((m) => m.info)));
  if (profile.apPercent >= 65) late.push(`Wróg zadaje głównie obrażenia magiczne (${profile.apPercent}%): odporność na magię opłaca się bardziej niż pancerz.`);
  else if (profile.adPercent >= 65) late.push(`Wróg zadaje głównie obrażenia fizyczne (${profile.adPercent}%): pancerz opłaca się bardziej niż odporność na magię.`);
  if (profile.threats.includes('dużo leczenia') || profile.threats.includes('leczenie')) late.push('Wróg się leczy: ktoś z drużyny powinien kupić antyleczenie.');

  return {
    ourStyle: ourStyle ? ourStyle.labels : [],
    theirStyle: theirStyle ? theirStyle.labels : [],
    phases: [
      { title: 'Początek gry', tips: early.slice(0, 3) },
      { title: 'Środek gry', tips: mid.slice(0, 2) },
      { title: 'Walki drużynowe', tips: late.slice(0, 3) },
    ].filter((p) => p.tips.length),
    ...playersToWatch(enemies, cardFor, game),
  };
}

module.exports = { gamePlan };
