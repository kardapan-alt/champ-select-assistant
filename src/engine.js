// Logika asystenta: odczyt stanu wyboru postaci, sugestie picków, runy i build.
// Czyste funkcje, bez Electrona i sieci, żeby dało się je testować.

const { detectSituations, situationView, reasonFor } = require('./situational');
const { liveSituations, mergeSituations, offensiveBuild } = require('./live-build');
const { itemAvailable, itemFitsResource, itemsCompatible, redundantSpellblade, purchaseItem } = require('./itemrules');
const { canonicalAlias, usesMana, resourceFor } = require('./champion-identity');
const runeContext = require('../data/rune-context.json').champions;
const { buildIdentity, isSupportCore } = require('./base-build');
const { roleQuestFor, BOOT_UPGRADES, SUPPORT_ITEMS, baseBoots, isBootItem } = require('./rolequests');
const { normalizePins, validateRunes } = require('./choices');
const { isAram } = require('./modes');
const { knownRole } = require('./players');
const mayhem = require('./mayhem');

const POSITION_LABELS = {
  top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'ADC', utility: 'Support', '': 'Brak roli',
};
// LCU nazywa supporta "utility", dane używają "support".
const toDataRole = (pos) => (pos === 'utility' ? 'support' : pos);

// ---------- stan wyboru postaci ----------

// extra: listy z klienta, niezależne od akcji w sesji: pickable (kogo możesz teraz wybrać) i disabled (zbanowani).
function readSession(session, mode = 'classic', extra = {}) {
  const actions = (session.actions || []).flat();
  const pickActions = actions.filter((a) => a.type === 'pick');
  const lockedCells = new Set(pickActions.filter((a) => a.completed).map((a) => a.actorCellId));
  const hoverByCell = new Map();
  for (const a of pickActions) {
    if (!a.completed && a.championId) hoverByCell.set(a.actorCellId, a.championId);
  }
  const me = session.localPlayerCellId;

  const allies = (session.myTeam || []).map((p) => {
    const locked = lockedCells.has(p.cellId) && p.championId > 0;
    const championId = p.championId || hoverByCell.get(p.cellId) || p.championPickIntent || 0;
    return {
      cellId: p.cellId,
      position: p.assignedPosition || '',
      championId,
      locked,
      isMe: p.cellId === me,
      skinId: p.selectedSkinId || 0,
      spell1Id: p.spell1Id,
      spell2Id: p.spell2Id,
    };
  });
  // Przeciwnicy: tylko championy widoczne w kliencie, bez żadnych danych graczy.
  const enemies = (session.theirTeam || []).map((p) => ({
    cellId: p.cellId,
    position: p.assignedPosition || '',
    championId: p.championId || 0,
    skinId: p.selectedSkinId || 0,
    locked: lockedCells.has(p.cellId) && p.championId > 0,
  }));

  // Bany: zakończone u obu drużyn oraz te, które Twoja drużyna właśnie wybiera (ich też nie proponujemy).
  const myCells = new Set((session.myTeam || []).map((p) => p.cellId));
  const bans = new Set([
    ...((session.bans && session.bans.myTeamBans) || []),
    ...((session.bans && session.bans.theirTeamBans) || []),
    ...actions.filter((a) => a.type === 'ban' && (a.completed || a.isAllyAction || myCells.has(a.actorCellId))).map((a) => a.championId),
    ...(extra.disabled || []),
  ].map(Number).filter((id) => id > 0));
  // Klient sam wie, kogo możesz wybrać (bez banów, cudzych picków i nieposiadanych). Pusta lista = brak danych.
  const pickable = extra.pickable && extra.pickable.length ? new Set(extra.pickable.map(Number)) : null;

  const phase = (session.timer && session.timer.phase) || '';
  const aram = isAram(mode) || !!session.benchEnabled;
  // ARAM nie ma blokowania: championy są przydzielone od razu, a zamiana z ławką jest możliwa do końca.
  const allLocked = phase === 'FINALIZATION' || phase === 'GAME_STARTING'
    || (pickActions.length > 0 && pickActions.every((a) => a.completed))
    || (aram && allies.length > 0 && allies.every((a) => a.championId > 0));
  if (aram) for (const a of allies) a.locked = a.championId > 0;
  const bench = (session.benchChampions || session.benchChampionIds || [])
    .map((b) => Number(typeof b === 'object' ? b.championId : b)).filter((id) => id > 0);

  const banActions = actions.filter((a) => a.type === 'ban');
  const banPhase = phase === 'PLANNING' || banActions.some((a) => a.isInProgress && !a.completed);
  const myBanTurn = banActions.some((a) => a.actorCellId === me && a.isInProgress && !a.completed);

  return { me: allies.find((a) => a.isMe) || null, allies, enemies, bans, pickable, phase, allLocked, banPhase, myBanTurn,
    mode: mode === 'practice' || mode === 'mayhem' ? mode : aram ? 'aram' : 'classic', bench,
    roleQuestsEnabled: aram || mode === 'practice' ? false : extra.roleQuestsEnabled };
}

// ---------- informacje o championach ----------

const CLASS_FROM_ROLES = { marksman: 'adc', mage: 'mage', assassin: 'assassin', tank: 'tank', fighter: 'fighter', support: 'support' };

function champInfo(alias, game, data) {
  const known = data.champions[alias] || data.champions[canonicalAlias(alias)];
  if (known) return { ...known, alias };
  // Champion spoza wbudowanych danych: przybliżenie po klasie z klienta.
  const summary = game.championsByAlias.get(alias);
  const lcuRoles = ((summary && summary.roles) || []).map((r) => String(r).toLowerCase());
  const has = (trait) => ((data.championTraits || {})[trait] || []).includes(alias);
  let cls = lcuRoles.includes('marksman') ? 'adc' : CLASS_FROM_ROLES[lcuRoles[0]] || 'fighter';
  if (has('tank')) cls = 'tank';
  else if (has('support')) cls = 'support';
  const ap = has('ap') || (lcuRoles.includes('mage') && cls !== 'adc');
  const dmg = ap ? 'ap' : ['tank', 'support'].includes(cls) ? 'mixed' : 'ad';
  const traits = [];
  if (cls === 'tank') traits.push('frontline', 'tank', 'engage');
  for (const t of ['heal', 'cc', 'burst']) if (has(t)) traits.push(t);
  if (cls === 'assassin') traits.push('burst');
  return { alias, roles: [], class: cls, dmg, traits, counters: [], weakVs: [], unknown: true };
}

// Ile realnych obrażeń zadaje dany typ postaci (tanki i enchanterzy mniej niż carry).
const DAMAGE_WEIGHT = { tank: 0.5, support: 0.6 };

function teamProfile(infos) {
  const p = {
    ad: 0, ap: 0, adWeighted: 0, apWeighted: 0, frontline: 0, engage: 0, tanks: 0, heal: 0,
    dive: 0, burst: 0, cc: 0, marksmen: 0, count: infos.length, offensiveBuilds:{ap:[],ad:[]},
  };
  for (const c of infos) {
    const w = c.offensiveBuild ? 1 : DAMAGE_WEIGHT[c.class] || 1;
    const baseMagic = c.dmg === 'ad' ? 0 : c.dmg === 'ap' ? 1 : 0.5;
    // Items indicate a build direction. Abilities can still deal their native damage type.
    const magic = c.offensiveBuild ? 0.25 * baseMagic + 0.75 * Number(c.offensiveBuild === 'ap') : baseMagic;
    if (c.offensiveBuild) p.offensiveBuilds[c.offensiveBuild].push(c.alias);
    p.ad += 1 - magic; p.ap += magic; p.adWeighted += (1 - magic) * w; p.apWeighted += magic * w;
    const t = c.traits || [];
    if (t.includes('frontline') || t.includes('tank')) p.frontline += 1;
    if (t.includes('engage')) p.engage += 1;
    if (t.includes('tank')) p.tanks += 1;
    if (t.includes('heal') || t.includes('sustain')) p.heal += 1;
    if (t.includes('dive')) p.dive += 1;
    if (t.includes('burst') || c.class === 'assassin') p.burst += 1;
    if (t.includes('cc') || t.includes('engage')) p.cc += 1;
    if (c.class === 'adc' && c.dmg !== 'ap') p.marksmen += 1;
  }
  const total = p.adWeighted + p.apWeighted;
  p.apShare = total ? p.apWeighted / total : 0.5;
  p.adShare = total ? p.adWeighted / total : 0.5;
  return p;
}

function buildEnemyProfile(state, game, data) {
  const infos = state.enemies.flatMap(player => {
    const alias = game.championsById.get(player.championId)?.alias;
    if (!alias) return [];
    const live = state.liveEnemies?.find(e => e.championId === player.championId && (!e.alias || canonicalAlias(e.alias) === canonicalAlias(alias)));
    return [{...champInfo(alias, game, data), offensiveBuild:offensiveBuild(live?.items, game)}];
  });
  return teamProfile(infos);
}

// Zamienia skład wroga na wagi zagrożeń, na które odpowiadają tagi itemów.
function threatWeights(enemy) {
  if (!enemy.count) return { late: 1 };
  // Przy 5 widocznych przeciwnikach pełna waga, przy mniejszej liczbie ostrożniej.
  const certainty = Math.min(1, 0.4 + enemy.count * 0.12);
  const clamp = (v) => Math.max(0, Math.min(3, v));
  return {
    mr: clamp((enemy.apShare - 0.35) * 6) * certainty,
    armor: clamp((enemy.adShare - 0.35) * 6) * certainty,
    antiheal: enemy.heal ? 0.7 + 0.45 * enemy.heal : 0,
    antiburst: 0.45 * enemy.burst + 0.25 * enemy.dive,
    cc: enemy.cc >= 2 ? 0.35 * enemy.cc : 0,
    tanks: enemy.tanks >= 2 ? 0.6 * enemy.tanks : 0.25 * enemy.tanks,
    crit: 0.6 * enemy.marksmen,
    autos: 0.6 * enemy.marksmen,
    late: 0.7,
  };
}

const THREAT_REASONS = {
  mr: 'dużo obrażeń magicznych',
  armor: 'dużo obrażeń fizycznych',
  antiheal: 'antyleczenie',
  antiburst: 'przeciw burstowi',
  cc: 'dużo CC u wrogów',
  tanks: 'przeciw tankom',
  crit: 'przeciw strzelcom (kryt)',
  autos: 'przeciw autoatakom',
  late: 'obrażenia / późna gra',
};

function describeEnemy(enemy) {
  const threats = [];
  if (enemy.cc >= 3) threats.push('dużo CC');
  if (enemy.heal >= 1) threats.push(enemy.heal >= 2 ? 'dużo leczenia' : 'leczenie');
  if (enemy.tanks >= 2) threats.push('tanki');
  if (enemy.burst >= 2) threats.push('burst');
  if (enemy.dive >= 2) threats.push('dive');
  return {
    apPercent: Math.round(enemy.apShare * 100),
    adPercent: Math.round(enemy.adShare * 100),
    threats,
    count: enemy.count,
  };
}

// ---------- meta, synergie, archetypy ----------

const TIER_VALUE = { S: 4, A: 3, B: 2, C: 1 };

function tierOf(alias, data) {
  const tiers = (data.meta && data.meta.tiers) || {};
  for (const [tier, list] of Object.entries(tiers)) if (list.includes(alias)) return tier;
  return null;
}

// Ile postaci w danych twardo kontruje championa (im mniej, tym bezpieczniejszy blind pick).
function counterCount(alias, data) {
  const champ = data.champions[alias];
  const set = new Set((champ && champ.weakVs) || []);
  for (const [other, c] of Object.entries(data.champions)) if ((c.counters || []).includes(alias)) set.add(other);
  return set.size;
}

function synergyBetween(a, b, data) {
  const pair = (data.synergies || []).find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (pair) return { score: 8, note: pair[2] || '' };
  const ca = data.champions[a];
  const cb = data.champions[b];
  if (!ca || !cb) return null;
  if ((ca.synergyStats || []).includes(b) || (cb.synergyStats || []).includes(a)) return { score: 6, note: 'wysoki winrate razem' };
  const ta = ca.traits || [];
  const tb = cb.traits || [];
  const enchanterCarry = (t1, c2, t2) => t1.includes('enchanter') && c2.class === 'adc' && t2.includes('scaling');
  if (enchanterCarry(ta, cb, tb) || enchanterCarry(tb, ca, ta)) return { score: 5, note: 'enchanter + skalujący strzelec' };
  return null;
}

const ARCHETYPES = {
  dive: { label: 'Dive', traits: ['dive', 'engage', 'mobile'] },
  engage: { label: 'Engage / teamfight', traits: ['engage', 'teamfight', 'cc'] },
  poke: { label: 'Poke', traits: ['poke', 'siege'] },
  protect: { label: 'Ochrona carry', traits: ['peel', 'enchanter', 'antidive', 'scaling'] },
  pick: { label: 'Pick (łapanie)', traits: ['pick'] },
  split: { label: 'Splitpush', traits: ['splitpush'] },
};

const ARCHETYPE_HINTS = {
  dive: { needs: ['peel', 'antidive', 'disengage'], text: 'przeciw dive: peel i disengage' },
  engage: { needs: ['disengage', 'poke', 'peel'], text: 'przeciw engage: disengage albo poke' },
  poke: { needs: ['engage', 'dive', 'sustain', 'heal'], text: 'przeciw poke: szybki engage' },
  protect: { needs: ['poke', 'pick', 'tankkiller'], text: 'przeciw ochronie carry: poke i łapanie' },
  pick: { needs: ['peel', 'frontline', 'tank'], text: 'przeciw pickom: frontline i grupowanie' },
  split: { needs: ['splitpush', 'global', 'pick'], text: 'przeciw splitpush: ktoś na boczną linię' },
};

function archetypeOf(infos) {
  if (infos.length < 2) return null;
  const scores = Object.entries(ARCHETYPES).map(([key, a]) => {
    let score = 0;
    for (const c of infos) score += a.traits.filter((t) => (c.traits || []).includes(t)).length;
    return { key, label: a.label, score: score / Math.max(3, infos.length) };
  }).sort((x, y) => y.score - x.score);
  const top = scores.filter((x) => x.score >= 0.5).slice(0, 2);
  return top.length ? { primary: top[0].key, labels: top.map((x) => x.label), hint: ARCHETYPE_HINTS[top[0].key].text } : null;
}

function teamInfos(list, game, data) {
  const aliasOf = (id) => game.championsById.get(id)?.alias;
  return list.filter((p) => p.championId).map((p) => champInfo(aliasOf(p.championId), game, data)).filter((c) => c.alias);
}

function compositions(state, game, data) {
  return {
    ally: archetypeOf(teamInfos(state.allies, game, data)),
    enemy: archetypeOf(teamInfos(state.enemies, game, data)),
  };
}

// ---------- sugestie ----------

function nameOf(alias, game) {
  return game.championsByAlias.get(alias)?.name || alias;
}

function masteryOf(id, game) {
  const m = game.mastery && game.mastery.get(id);
  return m ? { points: m.championPoints || 0, level: m.championLevel || 0 } : { points: 0, level: 0 };
}

function suggestPicks(state, game, data, options = {}) {
  const limit = options.limit || 10;
  const position = toDataRole(state.me ? state.me.position : '');
  const name = (alias) => nameOf(alias, game);

  const taken = new Set([...state.bans]);
  for (const a of state.allies) if (a.locked) taken.add(a.championId);
  for (const e of state.enemies) if (e.championId) taken.add(e.championId);

  const allyInfos = teamInfos(state.allies.filter((a) => !a.isMe), game, data);
  const enemyInfos = teamInfos(state.enemies, game, data);
  const ally = teamProfile(allyInfos);
  const enemy = teamProfile(enemyInfos);
  const allyAliases = new Set(allyInfos.map((c) => c.alias));
  const allyArch = archetypeOf(allyInfos);
  const enemyArch = archetypeOf(enemyInfos);

  // Blind pick: przeciwnik z Twojej linii jeszcze nie jest widoczny.
  const laneOpponent = laneOpponentOf(state, game, data);
  const blind = !laneOpponent && !options.aram;

  const results = [];
  // options.only: tylko te championy (np. ławka ARAM-u), niezależnie od posiadania.
  const source = options.only
    ? [...options.only].map((id) => game.championsById.get(id)?.alias).filter(Boolean).map((a) => [a, champInfo(a, game, data)])
    : Object.entries(data.champions);
  for (const [alias, champ] of source) {
    const summary = game.championsByAlias.get(alias);
    if (!summary || (!options.only && (taken.has(summary.id) || allyAliases.has(alias)))) continue;
    if (!options.only && game.owned && game.owned.size > 0 && !game.owned.has(summary.id)) continue;
    if (!options.only && state.pickable && !state.pickable.has(summary.id) && summary.id !== (state.me && state.me.championId)) continue;
    if (position && !champ.roles.includes(position)) continue;

    let score = 50;
    const reasons = [];
    if (!position) score += champ.roles.length > 1 ? 2 : 0;
    if (position && champ.roles[0] === position) score += 3;
    // Rola poboczna (np. mag na supporcie): grywalne, ale rzadziej niż główne picki tej roli.
    if (position && champ.roles[0] !== position) { score -= 6; reasons.push({ good: false, text: 'rzadziej grany na tej roli' }); }

    const tier = options.aram ? null : tierOf(alias, data);
    const tierPts = (TIER_VALUE[tier] || 2) - 2;
    score += tierPts * (blind ? 6 : 3);
    if (tier === 'S' || (tier === 'A' && blind)) reasons.push({ good: true, text: `mocny w mecie (tier ${tier})` });

    if (blind) {
      // Brak wpisów nie jest dowodem bezpieczeństwa. Porównujemy tylko matchupy
      // z wystarczającą próbą, a nie długości niepełnych list kontr.
      const rates = Object.values(champ.matchupEvidence || {}).filter((m) => m.games >= 100);
      if (rates.length >= 8) {
        const bad = rates.filter((m) => m.winRate <= 48.5).length;
        const ratio = bad / rates.length;
        score += ratio <= 0.15 ? 4 : ratio >= 0.4 ? -6 : 0;
        if (ratio <= 0.15) reasons.push({ good: true, text: `mało trudnych matchupów w danych (${bad}/${rates.length})` });
        else if (ratio >= 0.4) reasons.push({ good: false, text: `wiele trudnych matchupów w danych (${bad}/${rates.length})` });
      }
    }

    for (const e of enemyInfos) {
      const weight = laneOpponent && e.alias === laneOpponent.alias ? 1.8 : 1;
      // Wpis championa o tym matchupie ma pierwszeństwo przed wpisem przeciwnika (żeby nie było sprzeczności).
      const ownGood = (champ.counters || []).includes(e.alias);
      const ownBad = (champ.weakVs || []).includes(e.alias);
      const good = ownGood || (!ownBad && (e.weakVs || []).includes(alias));
      const bad = ownBad || (!ownGood && (e.counters || []).includes(alias));
      if (good) {
        score += 12 * weight;
        reasons.push({ good: true, text: `kontruje ${name(e.alias)}` });
      }
      if (bad) {
        score -= 12 * weight;
        reasons.push({ good: false, text: `słaby przeciwko ${name(e.alias)}` });
      }
    }
    for (const a of allyInfos) {
      const syn = synergyBetween(alias, a.alias, data);
      if (syn) {
        score += syn.score;
        reasons.push({ good: true, text: `synergia z ${name(a.alias)}${syn.note ? ` (${syn.note})` : ''}` });
      }
    }

    const t = champ.traits || [];
    if (ally.count >= 2) {
      if (ally.ap === 0 && champ.dmg === 'ap' && !['tank', 'support'].includes(champ.class)) { score += 10; reasons.push({ good: true, text: 'uzupełnia obrażenia magiczne drużyny' }); }
      if (ally.ad === 0 && champ.dmg === 'ad') { score += 10; reasons.push({ good: true, text: 'drużynie brakuje obrażeń fizycznych' }); }
      if (ally.ap >= 3 && champ.dmg === 'ap') { score -= 6; reasons.push({ good: false, text: 'drużyna ma już dużo AP' }); }
      if (ally.ad >= 3 && champ.dmg === 'ad') { score -= 6; reasons.push({ good: false, text: 'drużyna ma już dużo AD' }); }
    }
    if (ally.count >= 2 && ally.frontline === 0 && (t.includes('frontline') || t.includes('tank'))) {
      score += 9; reasons.push({ good: true, text: 'daje frontline, którego brakuje' });
    }
    if (ally.count >= 2 && ally.engage === 0 && t.includes('engage')) {
      score += 6; reasons.push({ good: true, text: 'daje engage' });
    }
    // Kruchy carry bez ucieczki i ochrony to łatwy cel dla zabójców i dive'u.
    const divers = enemyInfos.filter((e) => e.class === 'assassin' || (e.traits || []).some((x) => x === 'dive' || x === 'burst'));
    const fragile = ['adc', 'mage'].includes(champ.class) && !t.some((x) => ['mobile', 'peel', 'antidive', 'safe', 'disengage'].includes(x));
    if (fragile && divers.length >= 2) {
      score -= 4 * divers.length;
      reasons.push({ good: false, text: `łatwy cel dla ${divers.slice(0, 3).map((e) => name(e.alias)).join(', ')}` });
    }
    if (enemyArch && ARCHETYPE_HINTS[enemyArch.primary].needs.some((n) => t.includes(n))) {
      score += 5; reasons.push({ good: true, text: `odpowiada na styl wroga (${ARCHETYPES[enemyArch.primary].label})` });
    } else if ((enemy.dive >= 2 || enemy.burst >= 2) && (t.includes('peel') || t.includes('antidive'))) {
      score += 5; reasons.push({ good: true, text: 'chroni przed dive/burstem wrogów' });
    }
    if (allyArch && ARCHETYPES[allyArch.primary].traits.some((x) => t.includes(x))) {
      score += 3; reasons.push({ good: true, text: `pasuje do stylu drużyny (${ARCHETYPES[allyArch.primary].label})` });
    }
    // ARAM: jedna linia bez powrotów do bazy, więc poke i leczenie są warte więcej niż zwykle.
    if (options.aram && t.includes('poke')) { score += 4; reasons.push({ good: true, text: 'poke jest mocny na ARAM-ie' }); }
    if (options.aram && (t.includes('heal') || t.includes('sustain'))) { score += 3; reasons.push({ good: true, text: 'leczenie pomaga, gdy nie ma powrotów do bazy' }); }
    if (enemy.tanks >= 2 && t.includes('tankkiller')) {
      score += 7; reasons.push({ good: true, text: 'dobry na tanki przeciwnika' });
    }

    // Najpierw minusy, potem plusy według wagi: gracz od razu widzi ryzyko.
    reasons.sort((x, y) => Number(x.good) - Number(y.good));
    results.push({
      alias, championId: summary.id, name: summary.name, score: Math.round(score), tier,
      mastery: masteryOf(summary.id, game), reasons: reasons.slice(0, 5),
      dataNote: blind && Object.values(champ.matchupEvidence || {}).filter((m) => m.games >= 100).length < 8 ? 'Ograniczone dane matchupów' : '',
    });
  }
  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const masteryList = [...results].sort((a, b) => b.mastery.points - a.mastery.points || b.score - a.score).slice(0, limit);
  return { position, blind, laneOpponent: laneOpponent ? name(laneOpponent.alias) : null, list: results.slice(0, limit), masteryList };
}

// ARAM: który champion z ławki (albo obecny) najlepiej pasuje do składu drużyny.
function aramChoices(state, game, data) {
  if (!state.me || !state.me.championId) return [];
  const ids = [state.me.championId, ...state.bench.filter((id) => id !== state.me.championId)];
  if (ids.length < 2) return [];
  const { list } = suggestPicks({ ...state, me: { ...state.me, position: '' } }, game, data, { only: ids, limit: ids.length, aram: true });
  return list.map((c) => ({ ...c, current: c.championId === state.me.championId }));
}

// ---------- bany ----------

// Bany: kto jest mocny w mecie, kontruje to, co Ty i sojusznicy chcecie grać, i gra na Twojej linii.
// Nie sugeruje banów postaci, które sojusznicy hoverują.
function suggestBans(state, game, data, options = {}) {
  const limit = options.limit || 5;
  const aliasOf = (id) => game.championsById.get(id)?.alias;
  const position = toDataRole(state.me ? state.me.position : '');
  const myAlias = state.me && state.me.championId ? aliasOf(state.me.championId) : null;
  const allyIntents = state.allies.filter((a) => !a.isMe && a.championId).map((a) => ({ alias: aliasOf(a.championId), position: toDataRole(a.position) })).filter((a) => a.alias);
  const protectedIds = new Set(state.allies.map((a) => a.championId).filter(Boolean));
  const name = (alias) => nameOf(alias, game);

  const results = [];
  for (const [alias, champ] of Object.entries(data.champions)) {
    const summary = game.championsByAlias.get(alias);
    if (!summary || state.bans.has(summary.id) || protectedIds.has(summary.id)) continue;
    const reasons = [];
    const tier = tierOf(alias, data);
    let score = (TIER_VALUE[tier] || 2) * 8;
    if (tier === 'S') reasons.push(`tier ${tier} w mecie`);

    const beats = (target) => (champ.counters || []).includes(target) || ((data.champions[target] || {}).weakVs || []).includes(alias);
    if (myAlias && beats(myAlias)) { score += 25; reasons.push(`kontruje Twój pick (${name(myAlias)})`); }
    for (const a of allyIntents) {
      if (beats(a.alias)) { score += 10; reasons.push(`kontruje ${name(a.alias)}`); }
    }
    if (position && champ.roles[0] === position) { score += 6; reasons.push('gra na Twojej linii'); }
    results.push({ alias, championId: summary.id, name: summary.name, score: Math.round(score), tier, reasons: reasons.slice(0, 3) });
  }
  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return results.slice(0, limit);
}

// ---------- runy ----------

function defaultTemplate(champ, data) {
  const tpl = data.classTemplates[itemPoolKey(champ)] || data.classTemplates.fighter;
  const items=itemPoolKey(champ)==='mage'&&usesMana(champ.alias)===false?[3152,4645,3089]:tpl.items;
  // AP fighter/assassin describes combat style, not an AD shopping list.
  if (champ.dmg === 'ap' && ['fighter', 'assassin'].includes(champ.class))
    return { ...tpl, items, runes: champ.class === 'fighter' ? 'conqueror_mage' : 'electrocute_mage' };
  return {...tpl,items};
}

function resolveRunes(champ, data) {
  const tpl = defaultTemplate(champ, data);
  const ref = champ.runes || tpl.runes;
  return (typeof ref === 'string' ? data.runePresets[ref] : ref) || data.runePresets[tpl.runes];
}

// Dopasowuje stronę run do aktualnego patcha z klienta: nieistniejące runy zastępuje pierwszą w danym rzędzie.
function normalizeRunes(page, game) {
  page={...page,perks:page.perks.map(id=>id===8138?8140:id)};
  if (!game.styles || game.styles.size === 0) return { ...page, perks: [...page.perks], shards: [...page.shards] };
  const primary = game.styles.get(page.p) || [...game.styles.values()][0];
  let secondary = game.styles.get(page.s);
  if (!secondary || secondary.id === primary.id) secondary = [...game.styles.values()].find((s) => s.id !== primary.id);

  const regular = (style) => style.slots.filter((s) => s.type !== 'kStatMod');
  const pSlots = regular(primary);
  const perks = [];
  for (let i = 0; i < 4; i++) {
    const slot = pSlots[i];
    const want = page.perks[i];
    perks.push(slot.perks.includes(want) ? want : slot.perks[0]);
  }
  const sSlots = regular(secondary).slice(1);
  const usedSlots = new Set();
  const secondaryPerks = [];
  for (const want of page.perks.slice(4, 6)) {
    const idx = sSlots.findIndex((s, i) => !usedSlots.has(i) && s.perks.includes(want));
    if (idx >= 0) { usedSlots.add(idx); secondaryPerks.push(want); }
  }
  for (let i = 0; secondaryPerks.length < 2 && i < sSlots.length; i++) {
    if (!usedSlots.has(i)) { usedSlots.add(i); secondaryPerks.push(sSlots[i].perks[0]); }
  }
  const statSlots = primary.slots.filter((s) => s.type === 'kStatMod');
  const shards = statSlots.length
    ? statSlots.map((slot, i) => (slot.perks.includes(page.shards[i]) ? page.shards[i] : slot.perks[0]))
    : page.shards;
  return { p: primary.id, s: secondary.id, perks: [...perks, ...secondaryPerks], shards };
}

// ---------- dopasowanie pod mecz ----------

const MELEE_CLASSES = ['fighter', 'tank', 'assassin'];
const isRanged = (c) => runeContext[canonicalAlias(c.alias)]?.ranged ?? !MELEE_CLASSES.includes(c.class);

// Przeciwnik z Twojej linii (gdy jest już widoczny w champ selekcie).
function playerForRole(players, position, game, data) {
  const role = knownRole(position);
  if (!role) return null;
  const assignment = p => knownRole(p.position) || knownRole(p.assignedPosition);
  const assigned = players.filter(p => assignment(p) === role);
  if (assigned.length) return assigned.length === 1 && assigned[0].championId ? assigned[0] : null;
  const inferred = players.filter(p => {
    if (!p.championId || assignment(p)) return false;
    const alias = game.championsById.get(p.championId)?.alias;
    return alias && knownRole(champInfo(alias, game, data).roles?.[0]) === role;
  });
  return inferred.length === 1 ? inferred[0] : null;
}

function laneOpponentOf(state, game, data) {
  const player = playerForRole(state?.enemies || [], state?.me?.position, game, data);
  const alias = player && game.championsById.get(player.championId)?.alias;
  return alias ? { ...champInfo(alias, game, data), laneInferred: !knownRole(player.position) && !knownRole(player.assignedPosition) } : null;
}

// Wynik matchupu z perspektywy championa: własny wpis ma pierwszeństwo przed wpisem przeciwnika.
function matchupVerdict(champ, lane) {
  if (!lane) return 'unknown';
  if ((champ.counters || []).includes(lane.alias)) return 'good';
  if ((champ.weakVs || []).includes(lane.alias)) return 'bad';
  if ((lane.weakVs || []).includes(champ.alias)) return 'good';
  if ((lane.counters || []).includes(champ.alias)) return 'bad';
  return 'even';
}

// Champion grany poza swoją rolą bez statystyk OP.GG dla tej roli (np. Alistar na supporcie, Cho'Gath w jungli):
// Zachowuje własny build i runy. Brakujące dane i czary bierze od championa tej klasy i roli.
// Umiejętności, cechy i matchupy zostają własne.
function roleAdjusted(champ, role, data) {
  // Champion spoza danych (albo znany tylko z mety OP.GG) nie ma własnych run i itemów, tylko szablon klasy:
  // też bierze je od championa tej roli.
  const ownBuild = !champ.unknown && !champ.fromStats;
  if (champ.statsBuild || !role || role === 'aram' || ((champ.roles || [])[0] === role && ownBuild)) return champ;
  const main = Object.entries(data.champions).filter(([, c]) => (c.roles || [])[0] === role);
  const donor = main.find(([, c]) => c.class === champ.class && c.dmg === champ.dmg)
    || main.find(([, c]) => c.dmg === champ.dmg && !['tank','support'].includes(c.class))
    || (['tank','support'].includes(champ.class) ? main.find(([, c]) => c.class === champ.class) : null);
  if (!donor) return champ;
  const [from, d] = donor;
  const pick = (k) => (d[k] !== undefined ? d[k] : undefined);
  return { ...champ, runes: champ.runes||pick('runes'), runeRoleFrom:champ.runes?null:from, spells: pick('spells'), items: champ.items?.length?champ.items:pick('items'), boots: champ.boots||pick('boots'), starters: pick('starters'), roleFrom: from };
}

function matchContext(alias, state, game, data) {
  const base = champInfo(alias, game, data);
  const aram = !!state && isAram(state.mode);
  const position = aram ? 'aram' : toDataRole(state && state.me ? state.me.position : '') || (base.roles || [])[0] || '';
  let champ = roleAdjusted(base, position, data);
  if(aram && !champ.statsBuild && base.aram) champ={...champ,...base.aram};
  // Rune data may be available without a build (and vice versa). Never let an
  // item-only analysis or another role's donor overwrite the champion's page.
  const roleRunes=base.runesByRole?.[position];
  const runeBase=base.statsRunes?base.runes:aram?base.aram?.runes:roleRunes||base.runes;
  if(runeBase)champ={...champ,runes:runeBase,runeRoleFrom:null,
    runeRoleFallback:!aram&&!base.statsRunes&&!!base.runesByRole&&!roleRunes};
  champ=buildIdentity(champ,game);
  const enemyInfos = state ? teamInfos(state.enemies || [], game, data) : [];
  const lane = position === 'jungle' || aram ? null : laneOpponentOf(state, game, data);
  const laneEnemies=lane?[lane]:[];
  if(state&&!aram&&['bottom','support'].includes(position)){
    const other=laneOpponentOf({...state,me:{...state.me,position:position==='bottom'?'support':'bottom'}},game,data);
    if(other&&!laneEnemies.some(e=>e.alias===other.alias))laneEnemies.push(other);
  }
  return { champ, position, lane, laneEnemies, enemyInfos, enemy: teamProfile(enemyInfos), enemyCount: enemyInfos.length, verdict: matchupVerdict(champ, lane) };
}

const PERK = { secondWind: 8444, bonePlating: 8473, overgrowth: 8451, revitalize: 8453, conditioning: 8429, unflinching: 8242, cutDown: 8017, resolve: 8400 };
const SHARD = { health: 5011, tenacity: 5013 };

// Drobne zmiany strony run pod przeciwnika z linii i skład wroga.
// Zmieniamy tylko runy z tego samego rzędu, więc strona zawsze pozostaje poprawna.
function adaptRunes(page, ctx, game) {
  const changes = [];
  if (!game.styles || !game.styles.size) return { page, changes };
  const out = { ...page, perks: [...page.perks], shards: [...page.shards] };
  const perkName = (id) => game.perks.get(id)?.name || String(id);
  const regularSlots = (styleId) => (game.styles.get(styleId)?.slots || []).filter((s) => s.type !== 'kStatMod');
  const swap = (want, why, replace = () => true) => {
    for (let i = 1; i < out.perks.length; i++) {
      const slot = regularSlots(i < 4 ? out.p : out.s).find((s) => s.perks.includes(out.perks[i]));
      if (slot && slot.perks.includes(want) && replace(out.perks[i])) {
        if (out.perks[i] !== want) {
          changes.push(`${perkName(want)} zamiast ${perkName(out.perks[i])}: ${why}`);
          out.perks[i] = want;
        }
        return true;
      }
    }
    return false;
  };

  const { champ } = ctx;
  if(usesMana(champ.alias)===false)swap(8275,'Twoja postać nie korzysta z many',id=>id===8226);
  const resource=resourceFor(champ.alias);
  if(resource && !['Mana','Energy'].includes(resource))swap(9111,'Twoja postać nie korzysta z many ani energii',id=>id===8009);
  if(ctx.position==='aram'){
    swap(8140,'ARAM: zamiast wardów premia do odnowienia czarów przywoływacza',id=>[8137,8141].includes(id));
    swap(8236,'ARAM: na tej mapie nie ma rzeki',id=>id===8232);
  }
  const laneEnemies=ctx.laneEnemies||[];
  if (laneEnemies.length) {
    const pokers=laneEnemies.filter(e=>(e.traits||[]).includes('poke') || runeContext[canonicalAlias(e.alias)]?.poke
      || (['top','middle'].includes(ctx.position)&&isRanged(e)&&!isRanged(champ)));
    const engagers=laneEnemies.filter(e=>e.class==='assassin'||(e.traits||[]).some(t=>['burst','engage'].includes(t))||((e.traits||[]).includes('early')&&!isRanged(e)));
    const poke=pokers.length>0,allIn=engagers.length>0;
    const laneName=(poke?pokers:engagers).map(e=>nameOf(e.alias,game)).join(', ');
    if (poke || allIn) {
      const want = poke ? PERK.secondWind : PERK.bonePlating;
      const why = poke ? `powtarzające się obrażenia i poke ${laneName}` : `krótkie wymiany i burst ${laneName}`;
      const secondaryResource=usesMana(champ.alias)===true&&out.perks.slice(4).some(id=>[8226,8009].includes(id));
      if(!swap(want,why) && !isRanged(champ) && ['top','middle'].includes(ctx.position)
        && out.p!==PERK.resolve && !secondaryResource){
        const resolve=regularSlots(PERK.resolve);
        if(resolve[2]?.perks.includes(want)&&resolve[3]?.perks.includes(PERK.overgrowth)){
          const before=game.styles.get(out.s)?.name||'';
          out.s=PERK.resolve;out.perks=[...out.perks.slice(0,4),want,PERK.overgrowth];
          changes.push(`Resolve zamiast ${before} jako drugie drzewko (${perkName(want)}): ${why}`);
        }
      }
    }
  }

  if (ctx.position === 'aram') {
    const pokeCount = (ctx.enemyInfos || []).filter((e) => (e.traits || []).includes('poke') || runeContext[canonicalAlias(e.alias)]?.poke).length;
    if (pokeCount >= 2) swap(PERK.secondWind, 'ARAM: kilku przeciwników z poke');
    else if (ctx.enemy.burst >= 2) swap(PERK.bonePlating, 'ARAM: burst kilku przeciwników');
  }
  if (ctx.enemy.tanks >= 2 && !['tank', 'support'].includes(champ.class)) {
    swap(PERK.cutDown, 'frontline wroga: więcej obrażeń przeciw celom powyżej 60% zdrowia',id=>id===8014);
  }
  const durationCC=(ctx.enemyInfos||[]).filter(e=>runeContext[canonicalAlias(e.alias)]?.tenacityCC);
  if (durationCC.length >= 3 && !isRanged(champ)) swap(PERK.unflinching, 'dodatkowe odporności podczas CC w walce z bliska',id=>id!==PERK.revitalize);

  // Odłamki: trzeci rząd (obrona).
  const def = (game.styles.get(out.p)?.slots || []).filter((s) => s.type === 'kStatMod')[2];
  const shard = (want, why) => {
    if (def && def.perks.includes(want) && out.shards[2] !== want) {
      changes.push(`odłamek ${perkName(want)} zamiast ${perkName(out.shards[2])}: ${why}`);
      out.shards[2] = want;
    }
  };
  if (durationCC.length >= 3) shard(SHARD.tenacity, `CC skracane nieustępliwością: ${durationCC.map(e=>nameOf(e.alias,game)).join(', ')}`);
  return { page: out, changes };
}

const SPELL = { flash: 4, ignite: 14, tp: 12, heal: 7, exhaust: 3, smite: 11, barrier: 21, cleanse: 1, ghost: 6, clarity: 13, mark: 32 };

// ARAM: bez Smite'a i Teleportu. Śnieżka (Mark) dla wchodzących w walkę, Heal / Barrier / Exhaust dla reszty.
function aramSpells(ctx, has) {
  const { champ, enemy } = ctx;
  const t = champ.traits || [];
  const divers = enemy.burst + enemy.dive;
  const pick = (id, why) => (has(id) ? { ids: [SPELL.flash, id], why } : null);
  if (['tank', 'fighter', 'assassin'].includes(champ.class) || t.includes('engage') || t.includes('dive')) {
    return pick(SPELL.mark, 'ARAM: Śnieżka (Mark), żeby doskoczyć do wroga i zacząć walkę') || pick(SPELL.ghost, 'ARAM: Duch, żeby dogonić wroga');
  }
  if (champ.class === 'support' || t.includes('enchanter')) {
    return divers >= 2 ? pick(SPELL.exhaust, 'ARAM: Wyczerpanie na zabójców i dive') : pick(SPELL.heal, 'ARAM: Uzdrowienie dla Ciebie i sojusznika');
  }
  if (champ.class === 'adc') return pick(SPELL.heal, 'ARAM: Uzdrowienie, standard dla strzelca');
  return divers >= 2 ? pick(SPELL.barrier, 'ARAM: Bariera na burst i dive wroga') : pick(SPELL.heal, 'ARAM: Uzdrowienie w długich walkach');
}

// Czary przywoływacza: baza championa + zamiana drugiego czaru (nie Flasha) pod mecz.
function spellsFor(alias, state, game, data) {
  const ctx = matchContext(alias, state, game, data);
  const tpl = data.classTemplates[ctx.champ.class] || data.classTemplates.fighter;
  const ids = [...(ctx.champ.spells || tpl.spells)];
  let why = ctx.champ.roleFrom ? `czary typowe dla tej roli (jak u ${nameOf(ctx.champ.roleFrom, game)})` : '';
  const has = (id) => !(state?.mode === 'mayhem' && id === SPELL.exhaust) && (!game.spells.size || game.spells.has(id));
  const other = () => ids.find((id) => id !== SPELL.flash);
  const setOther = (to, reason) => {
    if (!has(to) || ids.includes(to)) return;
    ids[ids.findIndex((id) => id !== SPELL.flash)] = to;
    why = reason;
  };
  if (ctx.position === 'aram') return aramSpells(ctx, has) || { ids: [SPELL.flash, SPELL.heal], why: 'ARAM' };
  if (ctx.position === 'jungle') {
    // Champion grany zwykle na innej roli (np. Cho'Gath z topa) ma w danych Teleport: w jungli zawsze Smite.
    if (!ids.includes(SPELL.smite)) {
      ids[ids[0] === SPELL.flash ? 1 : 0] = SPELL.smite;
      if (!ids.includes(SPELL.flash)) ids[1] = SPELL.flash;
      why = 'Porażenie (Smite): grasz w jungli';
    }
    return { ids, why };
  }
  if (ids.includes(SPELL.smite)) {
    // Smite poza jungle (np. dane junglera grającego na linii): zamiana na czar tej roli.
    ids[ids.indexOf(SPELL.smite)] = ctx.position === 'top' ? SPELL.tp : ctx.position === 'support' ? SPELL.exhaust : SPELL.ignite;
    why = 'Bez Porażenia: nie grasz w jungli';
  }
  const { enemy, lane, champ } = ctx;
  const laneName = lane && nameOf(lane.alias, game);
  const divers = enemy.burst + enemy.dive;
  if (ctx.position === 'bottom') {
    if (enemy.cc >= 4) setOther(SPELL.cleanse, `Oczyszczenie: wrogowie mają dużo CC (${enemy.cc} postaci)`);
  } else if (ctx.position === 'support') {
    if (divers >= 3) setOther(SPELL.exhaust, 'Wyczerpanie: u wroga są zabójcy i dive');
    else if (other() === SPELL.exhaust && divers === 0 && ctx.enemyCount >= 4 && (champ.traits || []).includes('engage')) setOther(SPELL.ignite, 'Podpalenie: wróg nie ma zabójców, więcej presji na linii');
  } else if (ctx.position === 'middle') {
    if (lane && isRanged(champ) && (lane.class === 'assassin' || (lane.traits || []).includes('burst'))) setOther(SPELL.barrier, `Bariera: łatwiej przeżyć burst ${laneName}`);
  } else if (ctx.position === 'top') {
    if (ctx.verdict === 'good' && (champ.traits || []).includes('early') && other() === SPELL.tp) setOther(SPELL.ignite, `Podpalenie: wygrywasz matchup z ${laneName}, graj o zabójstwo`);
    else if (ctx.verdict === 'bad' && other() === SPELL.ignite) setOther(SPELL.tp, `Teleport: trudny matchup z ${laneName}, łatwiej wrócić na linię`);
  }
  return { ids, why };
}


function runePageFor(alias, game, data, state = null) {
  if (state?.mode === 'mayhem') {
    const spells = spellsFor(alias, state, game, data);
    return { disabled: true, reason: 'W Mayhem runy są wyłączone. Build dopasujesz przez augmenty.',
      spells: spells.ids.map(id => ({ id, name:game.spells.get(id)?.name || String(id), icon:game.spells.get(id)?.iconPath || '' })), spellsWhy:spells.why };
  }
  const champ = champInfo(alias, game, data);
  const ctx = matchContext(alias, state, game, data);
  const source = ctx.champ;
  let { page, changes } = adaptRunes(normalizeRunes(resolveRunes(source, data), game), ctx, game);
  let pinned = false;
  if (state?.choices?.runes) {
    try {
      const own = validateRunes(state.choices.runes, game);
      page = { p: own.primaryStyleId, s: own.subStyleId, perks: own.selectedPerkIds.slice(0, 6), shards: own.selectedPerkIds.slice(6) };
      changes = ['Zachowane własne runy — zmiany draftu i statystyk ich nie nadpiszą.'];
      pinned = true;
    } catch { changes.unshift('Zapisana strona run nie pasuje do aktualnych danych. Sprawdź własne wybory.'); }
  }
  if (source.runeRoleFrom && !pinned) {
    const role = POSITION_LABELS[ctx.position === 'support' ? 'utility' : ctx.position] || ctx.position;
    changes.unshift(`Runy pod rolę ${role} jak u ${nameOf(source.runeRoleFrom, game)}: brak własnych danych o runach ${nameOf(alias, game)}`);
  }
  const runeSource=pinned?null:resolveRunes(source,data).source||null;
  const sourceRole=runeSource?.position;
  const roleLabel=POSITION_LABELS[sourceRole==='support'?'utility':sourceRole]||sourceRole||'';
  const sourceNote=pinned?'Twoja przypięta strona run.':runeSource
    ? `Runy: ${ctx.position==='aram'?'ARAM':roleLabel} · OP.GG${runeSource.patch?' '+runeSource.patch:''}${runeSource.live?' · bieżący odczyt':', zapis '+runeSource.fetched}.${source.runeRoleFallback?' Brak danych dla tej roli — baza własnego championa.':''}`
    : 'Runy: wbudowany szablon — brak statystyk dla tej postaci i roli.';
  const name = game.championsByAlias.get(alias)?.name || alias;
  const describe = (id) => ({ id, name: game.perks.get(id)?.name || String(id), icon: game.perks.get(id)?.iconPath || '' });
  const spells = spellsFor(alias, state, game, data);
  return {
    name: `CS Assist: ${name}${ctx.lane ? ` vs ${nameOf(ctx.lane.alias, game)}` : ''}`.slice(0, 50),
    primaryStyleId: page.p,
    pinned,
    runeSource,
    sourceNote,
    subStyleId: page.s,
    selectedPerkIds: [...page.perks, ...page.shards],
    primaryStyle: game.styles.get(page.p)?.name || String(page.p),
    subStyle: game.styles.get(page.s)?.name || String(page.s),
    keystone: describe(page.perks[0]),
    perks: page.perks.slice(1).map(describe),
    shards: page.shards.map(describe),
    adaptations: changes,
    laneOpponent: ctx.lane ? nameOf(ctx.lane.alias, game) : null,
    laneInferred:ctx.lane?.laneInferred||false,
    spells: spells.ids.map((sid) => ({ id: sid, name: game.spells.get(sid)?.name || String(sid), icon: game.spells.get(sid)?.iconPath || '' })),
    spellsWhy: spells.why,
  };
}

// ---------- build ----------

function itemPoolKey(champ) {
  const kind=champ.buildClass||champ.class;
  if (kind === 'tank' || kind === 'support') return kind;
  if (champ.dmg === 'ap') return 'mage';
  return champ.class === 'adc' || champ.class === 'assassin' ? champ.class : 'fighter';
}

const junglePets = new Set([1101, 1102, 1103]);
function isRoleStarter(id, position) {
  return position === 'support' ? id === 3865 : position === 'jungle' && junglePets.has(id);
}

function startingItems(ctx, data) {
  const role = ctx.position;
  const roleShop = role === 'support' || role === 'jungle';
  const fallback = data.starters?.[roleShop ? role : itemPoolKey(ctx.champ)] || [];
  const picks = ctx.champ.starters;
  // A champion's saved page may describe a different role.
  if (!picks?.length || (roleShop && !picks.some(id => isRoleStarter(id, role)))) return fallback;
  return picks;
}

const FIXED_CORE = 2; // spokojny draft: 2 itemy bazowe; mocne zagrożenie: pierwszy item + wcześniejsza odpowiedź

function tankDefense(enemy, game, tank) {
  if (!tank || enemy.count < 3) return null;
  const magic = enemy.apShare > enemy.adShare;
  const share = magic ? enemy.apShare : enemy.adShare;
  const attackers = magic ? enemy.ap : enemy.ad;
  // Three casters may look close to 50/50 while the tank/support still has no public purchases.
  if (share < 0.58 && !(share > 0.5 && attackers >= 3 && attackers > enemy.count / 2)) return null;
  const buyers = enemy.offensiveBuilds[magic ? 'ap' : 'ad'];
  return {
    desired:share >= 0.72 ? 2 : 1,
    reason:(magic ? 'MR przeciw przewadze obrażeń magicznych' : 'Pancerz przeciw przewadze obrażeń fizycznych') +
      (buyers.length ? ` (zakupy ${magic ? 'AP' : 'AD'}: ${buyers.join(', ')})` : ' w składzie wroga'),
    rating(id) {
      const categories = game.items.get(id)?.categories || [];
      const armor = categories.includes('Armor'), mr = categories.includes('SpellBlock') || categories.includes('MagicResist');
      if (mr && armor) return 0.5;
      if (!mr && !armor) return 0;
      return magic === mr ? 1 : -1;
    },
  };
}

// Adaptacyjny build: każdy item dostaje punkty za to, jak odpowiada na zagrożenia w składzie wroga.
// Po wybraniu itemu dane zagrożenie słabnie, więc przy skrajnym składzie (np. 4 AP) wejdzie kilka itemów na MR,
// a przy zbalansowanym tylko jeden.
function buildFor(alias, state, game, data) {
  const ctx = matchContext(alias, state, game, data);
  let champ = ctx.champ;
  const aliasOf = (id) => game.championsById.get(id)?.alias;
  const enemy = buildEnemyProfile(state, game, data);
  const augmentation = state.mode === 'mayhem' ? mayhem.adaptation(state.mayhem, champ, {
    enemy,game,core:defaultTemplate(champ,data).items,
  }) : null;
  const compatible = (id,ids) => itemsCompatible(id,ids,augmentation?.repeat) && !redundantSpellblade(id,ids);
  if (augmentation?.conversion) {
    const kind = augmentation.conversion === 'ap' ? 'mage' : 'fighter';
    champ = { ...champ, ...data.classTemplates[kind], class:kind, buildClass:kind, buildStyle:augmentation.conversion, dmg:augmentation.conversion, statsBuild:false, lateItems:[] };
  }
  const tpl = defaultTemplate(champ, data);
  const threats = threatWeights(enemy);
  const defense = tankDefense(enemy, game, itemPoolKey(champ) === 'tank');
  const quest = roleQuestFor(state);
  const bootsInQuest = quest?.extraSlot === 'boots';
  const owned = state.liveInventory?.owned || augmentation?.owned || [];
  const ownedBoots = state.liveInventory?.ownedBoots || augmentation?.ownedBoots;
  const skipped = new Set(augmentation ? state.skippedItems || [] : []);
  const fitsResource = id => itemFitsResource(id,game,alias);
  const questItems = new Set(augmentation ? [...mayhem.activeQuestItems(state.mayhem)].filter(fitsResource) : []);
  for (const id of [...owned,ownedBoots,...questItems,state.choices?.boots,...(state.choices?.items || []).map(p=>p.id)]) skipped.delete(id);
  const exists = id => !skipped.has(id) && itemAvailable(id,game,state.mode,alias) && fitsResource(id);
  const mainSlot = id => !isBootItem(id,game) && !SUPPORT_ITEMS.has(Number(id));
  const isBuildItem = id => mainSlot(id) && exists(id) && !augmentation?.excluded.has(id);
  // Inventory is observed state; the purchase filter applies only to future slots.
  const purchased = owned.filter(id => mainSlot(id) && (itemAvailable(id,game,state.mode,alias) || mayhem.ownedAvailable(id,game,alias,state.mode)));
  const supportItem = state.liveInventory?.items?.find(i => i.slot < 6 && SUPPORT_ITEMS.has(i.id));
  const planSupportSlot = !isAram(state.mode) && state.mode !== 'practice' && ctx.position === 'support' && purchased.length < 5;
  const reservedSlots = supportItem || planSupportSlot ? 1 : 0;
  const soldBoots = !!state.liveInventory && !ownedBoots && purchased.length + (supportItem ? 1 : 0) >= 6;
  const fullBuild = 6 - (soldBoots || bootsInQuest ? 0 : 1) - reservedSlots;
  const ownChoices = purchased.length ? { ...state.choices, items: [
    ...purchased.map((id, slot) => ({ id, slot })),
    ...(state.choices?.items || []).filter(p => p.slot >= purchased.length && !purchased.includes(p.id)),
  ] } : state.choices;
  const ownedRepeats = state.liveInventory ? purchased.filter((id,i)=>purchased.indexOf(id)!==i) : [];
  const pinRepeats = new Set([...(augmentation?.repeat || []),...ownedRepeats]);
  const { pins, warnings } = normalizePins(ownChoices, fullBuild, id => purchased.includes(id) || isBuildItem(id), pinRepeats);
  const pinIds = pins.map(p => p.id);

  // Buty
  let boots = baseBoots(champ.boots || tpl.boots);
  let bootsWhy = 'standardowe';
  const durable = ['fighter', 'tank', 'assassin'].includes(champ.class);
  if (durable && (enemy.apShare >= 0.6 || (enemy.cc >= 3 && enemy.apShare >= 0.45))) { boots = data.boots.vsAp; bootsWhy = 'MR i odporność na CC'; }
  else if (durable && enemy.adShare >= 0.6) { boots = data.boots.vsAd; bootsWhy = 'pancerz przeciw AD'; }
  else if (champ.class === 'mage' && enemy.apShare >= 0.65 && enemy.cc >= 3) { boots = data.boots.vsAp; bootsWhy = 'MR i odporność na CC'; }

  if (!exists(boots)) {
    const alternatives = [baseBoots(tpl.boots),data.boots.vsAd,data.boots.vsAp];
    if (skipped.size) alternatives.push(3158,3009,1001);
    if (skipped.has(boots)) bootsWhy = 'Alternatywa po pominięciu butów na ten mecz';
    boots = alternatives.find(exists);
  }
  const bootsPinned = !!state.choices?.boots && exists(state.choices.boots) && isBootItem(state.choices.boots, game);
  if (bootsPinned) { boots = baseBoots(state.choices.boots); bootsWhy = 'Twój przypięty wybór'; }
  if (ownedBoots && mayhem.ownedAvailable(ownedBoots,game,alias,state.mode)) { boots = ownedBoots; bootsWhy = 'Już posiadane buty'; }
  const core = (champ.items || tpl.items).map(purchaseItem).filter(isBuildItem).filter((id, i, all) => compatible(id, all.slice(0, i)));
  const pooledTags = (id) => (Object.values(data.itemPools || {}).flat().find((it) => it.id === id) || {}).tags || {};
  const lateStats = (champ.lateItems || []).map(it=>({...it,id:purchaseItem(it.id)})).filter((it) => isBuildItem(it.id));
  const topLate = Math.max(1, ...lateStats.map((it) => it.score));
  // Pozostałe itemy rdzenia i popularne późniejsze itemy z OP.GG startują z wysoką bazą,
  // żeby itemy sytuacyjne z wbudowanej puli wchodziły tylko przy wyraźnie jednostronnym składzie wroga.
  // Konkretne sytuacje (np. Yasuo + Jhin → Randuin's Omen): dwie najmocniejsze dostają miejsce w buildzie,
  // pozostałe konkurują z resztą itemów i zwykle lądują w alternatywach.
  const enemyList = state.enemies.filter((e) => e.championId).map((e) => {
    const a = aliasOf(e.championId);
    return a ? { alias: a, championId: e.championId, name: nameOf(a, game), traits: champInfo(a, game, data).traits || [] } : null;
  }).filter(Boolean);
  // Na ARAM-ie nie ma wardów ani Oracle Lens, więc niewidzialność nie ma odpowiedzi w sklepie.
  const counterAvailable = id => exists(id) && (!augmentation?.excluded.has(id) || owned.includes(id));
  const live = liveSituations(state.liveEnemies,itemPoolKey(champ),game,counterAvailable);
  const situations = mergeSituations(detectSituations(enemyList, itemPoolKey(champ), counterAvailable),live).filter((s) => !(isAram(state.mode) && s.vision));
  // Mortal Reminder odpowiada równocześnie na leczenie i pancerz. Nie dodajemy
  // obok niego drugiego, niekompatybilnego ulepszenia Last Whisper.
  const healing = situations.find((s) => s.key === 'heal' && s.level === 2);
  const tanks = situations.find((s) => s.key === 'tanks');
  if (itemPoolKey(champ) === 'adc' && healing?.myItem === 3033 && tanks) tanks.myItem = 3033;
  if (itemPoolKey(champ) === 'adc' && healing?.myItem === 3033) situations.filter(s=>s.key==='live-armor').forEach(s=>{s.myItem=3033;});
  const urgent = situations.filter((s) => s.level === 2 && s.myItem);
  // Zachowujemy pierwszy zakup definiujący championa. Mocne zagrożenia mogą
  // przesunąć drugi i trzeci przedmiot rdzenia, również przy danych OP.GG.
  let fixed = core.filter(id => compatible(id, pinIds)).slice(0, Math.min(fullBuild - pins.length, augmentation?.active || (purchased.length && live.length) ? 0 : urgent.length ? 1 : FIXED_CORE));
  if (defense) {
    // One defining first purchase is enough before answering a lopsided team.
    // Already-owned and manually pinned main items stay in their actual slots.
    fixed = purchased.length ? [] : fixed.slice(0, 1).filter(id => defense.rating(id) >= 0);
  }
  // Reakcja na zakupy wroga nie może wyprzeć całego rdzenia już wybranego
  // stylu gry. Dwa gotowe itemy krytyczne oznaczają inwestycję w kryty;
  // zachowujemy IE w wolnym miejscu, bez nadpisywania zakupów i przypięć.
  const critCore = champ.class === 'adc' && champ.dmg === 'ad'
    && purchased.filter(id => game.items.get(id)?.categories?.includes('CriticalStrike')).length >= 2
    && isBuildItem(3031) && compatible(3031, pinIds) && fullBuild > pins.length;
  if (critCore) fixed = [3031, ...fixed.filter(id => id !== 3031)].slice(0, fullBuild - pins.length);
  else if(!augmentation?.active && champ.buildStyle==='crit' && core.includes(3031)
    && compatible(3031,pinIds) && fixed.length<fullBuild-pins.length && !fixed.includes(3031)) fixed.push(3031);
  const situationByTag = new Map();
  const situational = new Map();
  let forced = 0;
  for (const s of situations) {
    if (!s.myItem) continue;
    const tag = `s:${s.key}`;
    const strong = s.level === 2 && forced < 2;
    if (strong) forced += 1;
    threats[tag] = strong ? (s.live ? 15 : 7) + Math.min(s.weight, 4) * 0.4 : 1.2;
    situationByTag.set(tag, s);
    const prev = situational.get(s.myItem);
    situational.set(s.myItem, { id: s.myItem, tags: { ...(prev ? prev.tags : pooledTags(s.myItem)), [tag]: 1 } });
  }
  const reasonOf = (tag) => (situationByTag.has(tag) ? reasonFor(situationByTag.get(tag)) : THREAT_REASONS[tag]);
  const coreRest = core.filter(id => !fixed.includes(id) && compatible(id, pinIds));
  const coreWeight = augmentation?.active ? 1.6 : 4;
  const fitsDamage = id => {
    if(core.includes(id)||pinIds.includes(id)||augmentation?.bonuses.has(id))return true;
    const tags=game.items.get(id)?.categories || [];
    if(champ.dmg==='ap'&&tags.includes('Damage')&&!tags.includes('SpellDamage'))return false;
    if(champ.dmg==='ad'&&tags.includes('SpellDamage')&&!tags.includes('Damage')&&!tags.some(t=>['Armor','SpellBlock','MagicResist'].includes(t)))
      return champ.buildStyle==='onhit'&&id===3115;
    return true;
  };
  // Late-item statistics pool different builds. Keep the chosen style; explicit
  // purchases, augment effects and concrete defensive responses remain eligible.
  const fitsLateStyle = id => {
    if(core.includes(id)||pinIds.includes(id)||augmentation?.bonuses.has(id)||situational.has(id))return true;
    const tags=game.items.get(id)?.categories || [];
    if(!tags.length)return true; // unavailable client metadata is not evidence of another style
    if(itemPoolKey(champ)==='mage' && champ.class!=='fighter' && !tags.includes('SpellDamage'))return false;
    if(itemPoolKey(champ)==='support' && tags.includes('SpellDamage') && !isSupportCore(id))return false;
    if(itemPoolKey(champ)==='tank' && tags.includes('SpellDamage') && !isSupportCore(id))return false;
    return true;
  };
  const fitsCritStyle = id => !(champ.buildStyle==='onhit' && [3031,6676].includes(id) && !core.includes(id) && !augmentation?.bonuses.has(id))
    && (id!==3031 || champ.buildStyle==='crit' || critCore || core.includes(3031) || augmentation?.bonuses.has(3031));
  const candidateEntries = [
    ...[...situational.values()].map((it) => (coreRest.includes(it.id) ? { ...it, tags: { ...it.tags, late: coreWeight }, core: true } : it)),
    ...coreRest.map((id) => ({ id, tags: { ...pooledTags(id), late: coreWeight }, core: true })),
    ...lateStats.filter(it=>fitsLateStyle(it.id)).map((it) => ({ id: it.id, tags: { ...pooledTags(it.id), late: 2 + 1.5 * (it.score / topLate) }, core: true, popular: true })),
    ...[...(augmentation?.bonuses.keys() || [])].map(id => ({ id, tags:pooledTags(id) })),
    ...((data.itemPools || {})[itemPoolKey(champ)] || []).filter((it) => !it.only || it.only.includes(champ.class))
      // Przy statystykach OP.GG item z puli nie wygrywa samą „późną grą”, tylko odpowiedzią na zagrożenie.
      .map((it) => (lateStats.length ? { ...it, tags: { ...it.tags, late: 0 } } : it)),
  ];
  const candidates = candidateEntries.filter((it, i, arr) => isBuildItem(it.id) && fitsDamage(it.id) && !fixed.includes(it.id)
    && arr.findIndex((x) => x.id === it.id) === i && fitsCritStyle(it.id));

  const left = { ...threats };
  const usedAugmentGroups = new Map();
  const satisfyAugment = id => new Set((augmentation?.bonuses.get(id)?.contributions || []).filter(c=>!c.direct).map(c=>c.family)).forEach(family=>usedAugmentGroups.set(family,(usedAugmentGroups.get(family)||0)+1));
  [...pinIds,...fixed].forEach(satisfyAugment);
  const augmentScore = id => {
    let direct=0;const families=new Map();
    for(const c of augmentation?.bonuses.get(id)?.contributions || []) {
      if(c.direct)direct+=c.score;
      else families.set(c.family,Math.max(families.get(c.family)||0,c.score*Math.pow(0.25,usedAugmentGroups.get(c.family)||0)));
    }
    return Math.min(30,direct+[...families.values()].reduce((sum,v)=>sum+v,0));
  };
  // Zwykła synergia może przyspieszyć zakup, ale jej słabsze kolejne warianty
  // nie powinny wypierać całego rdzenia. Jawna konwersja nadal go przebudowuje.
  const foundations = new Set(core);
  const coreScore = it => augmentation?.active && !augmentation.transformsBuild && foundations.has(it.id) ? 4 : 0;
  let coverage = 0, oppositeItems = 0;
  const countProtection = id => {
    const value = defense?.rating(id) || 0;
    coverage += Math.max(0, value);
    if (value < 0) oppositeItems++;
  };
  [...pinIds, ...fixed].forEach(countProtection);
  const resistanceScore = id => {
    if (!defense) return 0;
    const value = defense.rating(id), need = Math.max(0, defense.desired - coverage);
    return value >= 0 ? value * 8 * need : -(3 + 3 * need + 2 * oppositeItems);
  };
  const scoreOf = (it) => Object.entries(it.tags).reduce((sum, [tag, v]) => sum + v * (left[tag] || 0), 0) + augmentScore(it.id) + coreScore(it) + resistanceScore(it.id);
  const chosen = [];
  const inspectId = state.inspectItem;
  let lastCompetition = null;
  const pool = candidates.flatMap(it=>augmentation?.repeat.has(it.id) ? [it,{...it}] : [it]);
  while (chosen.length < fullBuild - fixed.length - pins.length && pool.length) {
    const selected = [...pinIds, ...fixed, ...chosen.map((x) => x.id)];
    for (let i = pool.length - 1; i >= 0; i--) if (!compatible(pool[i].id, selected) || (augmentation?.repeat.has(pool[i].id) && selected.filter(id=>id===pool[i].id).length>=2)) pool.splice(i, 1);
    if (!pool.length) break;
    pool.sort((a, b) => scoreOf(b) - scoreOf(a));
    const best = pool.shift();
    if (inspectId && best.id !== inspectId) {
      const competitor = pool.find(it => it.id === inspectId);
      if (competitor) lastCompetition = { winner:best.id, tied:scoreOf(best) === scoreOf(competitor) };
    }
    const contributions = Object.entries(best.tags).map(([tag, v]) => [tag, v * (left[tag] || 0)]).sort((a, b) => b[1] - a[1]);
    // Konkretna sytuacja (np. "zabójcy AD: Zed") jest czytelniejsza niż ogólny powód, więc ma pierwszeństwo.
    const specific = contributions.find(([tag, v]) => tag.startsWith('s:') && v > 0);
    const mainTag = specific ? specific[0] : contributions[0] && contributions[0][1] > 0 ? contributions[0][0] : 'late';
    const appliedBonus = augmentScore(best.id);
    const bonus = appliedBonus >= 1 ? augmentation?.bonuses.get(best.id) : null;
    const defensivePriority = resistanceScore(best.id) > 0;
    const priority = defensivePriority || appliedBonus >= 3 || urgent.some((s) => s.myItem === best.id);
    const why = bonus ? [...new Set(bonus.reasons)].slice(0,2).join('; ') : best.popular && mainTag === 'late' ? 'popularny w tym patchu' : best.core && mainTag === 'late' ? 'rdzeń championa' : reasonOf(mainTag);
    const purchaseReason = defensivePriority ? (specific ? reasonOf(mainTag) : defense.reason) : why;
    chosen.push({ ...best, priority, augmented:!!bonus && !defensivePriority, situational: defensivePriority || mainTag.startsWith('s:'), why:purchaseReason });
    countProtection(best.id);
    satisfyAugment(best.id);
    // Każdy item częściowo zaspokaja zagrożenie: przy skrajnym składzie zostaje miejsce na kolejny item tego typu.
    for (const [tag, v] of Object.entries(best.tags)) {
      left[tag] = tag.startsWith('s:') ? 0 : tag === 'late' ? (left[tag] || 0) * 0.85 : Math.max(0, (left[tag] || 0) - v * 0.55);
    }
  }
  pool.sort((a, b) => scoreOf(b) - scoreOf(a));
  const selectedIds = [...pinIds, ...fixed, ...chosen.map(c => c.id)];
  const alternatives = pool.filter((it) => !selectedIds.includes(it.id) && !redundantSpellblade(it.id,purchased)
    && scoreOf(it) > 0.5 && Object.keys(it.tags).some((t) => t !== 'late' && threats[t] > 0.6)).slice(0, 3);

  const item = (id) => {
    const it = game.items.get(id);
    return it ? { id, name: it.name, icon: it.iconPath } : { id, name: String(id), icon: '' };
  };
  const spell = (id) => ({ id, name: game.spells.get(id)?.name || String(id), icon: game.spells.get(id)?.iconPath || '' });

  const spells = spellsFor(alias, state, game, data);
  const notes = [];
  const automatic = [...fixed.map(id => {
    const sit = situations.find(s => s.myItem === id);
    return { ...item(id), why: critCore && id === 3031 ? 'wzmocnienie już kupionych przedmiotów pod kryty' : sit ? reasonFor(sit) : 'rdzeń championa',
      priority:critCore && id === 3031, situational: !!sit, source: 'core' };
  }), ...chosen.map(c => ({ ...item(c.id), why: c.why, priority: c.priority, situational: c.situational, source: c.augmented ? 'augment' : c.situational ? 'rule' : c.popular ? 'stats' : 'core' }))];
  const finalItems = Array.from({ length: fullBuild }, (_, slot) => {
    const pin = pins.find(p => p.slot === slot);
    return pin ? { ...item(pin.id), why: purchased.includes(pin.id) ? 'Już posiadasz — zachowany w buildzie' : 'Twój przypięty wybór', owned:purchased.includes(pin.id), pinned: true, source: purchased.includes(pin.id) ? 'owned' : 'pinned', slot } : automatic.length ? { ...automatic.shift(), slot } : null;
  }).filter(Boolean);
  const finalIds = finalItems.map(i => i.id);
  const manualPins = finalItems.filter(i => i.pinned && !i.owned).length;
  const replacedCore = core.filter((id) => !finalIds.includes(id));
  if (replacedCore.length) notes.push(`${replacedCore.map((id) => item(id).name).join(', ')} wypada z buildu po dopasowaniu do draftu${manualPins ? ' i Twoich przypiętych wyborów' : ''}.`);
  const decisions = finalItems.map((it, index) => {
    const step = soldBoots || index === 0 ? index + 1 : index + 2;
    const timing = it.owned ? 'W ekwipunku' : it.pinned ? 'Utrzymany na wybranym miejscu' : it.priority ? 'Przyspieszony zakup' : index >= 4 ? 'Uzupełnienie na późną grę' : 'Zakup w podstawowej kolejności';
    return { id: it.id, name: it.name, step, source: it.source, text: `${timing}: ${it.why}.` };
  });
  const moved = core.map((id, index) => ({ id, from: index, to: finalIds.indexOf(id) })).filter(x => x.to > x.from);
  const changes = [
    ...moved.map(x => `${item(x.id).name}: przesunięty z ${x.from + 1}. na ${x.to + 1}. miejsce wśród przedmiotów bez butów.`),
    ...replacedCore.map(id => `${item(id).name}: pominięty w docelowym zestawie.`),
  ];
  const firstPriority = finalItems.find(it => it.priority);
  const decisionSummary = firstPriority ? `${firstPriority.name} wcześniej: ${firstPriority.why}.`
    : manualPins ? `Przypięte wybory: ${manualPins}. Pozostałe zakupy dobrane do draftu.`
    : soldBoots ? 'Wszystkie główne przedmioty są w ekwipunku.' : 'Zachowany rdzeń; dalsze zakupy dopasowane do składu wroga.';
  const defensive = chosen.filter((c) => [THREAT_REASONS.mr, THREAT_REASONS.armor].includes(c.why));
  if (defensive.length >= 2) notes.push(`Skład wroga jest jednostronny, dlatego build ma ${defensive.length} itemy obronne.`);
  const supportWithoutBoots = supportItem && soldBoots;
  const questView = supportWithoutBoots && quest?.role === 'utility'
    ? { ...quest, summary:'5 przedmiotów i przedmiot wsparcia w sześciu slotach.',
      detail:'Twój ekwipunek jest pełny. Po queście Control Wardy mają osobny slot.' } : quest;
  if (questView) notes.push(questView.detail);
  else if (reservedSlots) notes.push('Jeden slot zostaje na przedmiot wsparcia. Control Wardy w tym trybie wymagają miejsca w ekwipunku.');
  const bootsUpgrade = quest?.role === 'middle' && game.items.has(BOOT_UPGRADES[boots]) ? item(BOOT_UPGRADES[boots]) : null;
  if (bootsUpgrade) notes.push(`Po queście mida: ${item(boots).name} → ${bootsUpgrade.name}, za darmo w tym samym slocie.`);
  const priorityItems = chosen.filter((c) => c.priority);
  if (priorityItems.length) notes.push(`Wcześniejszy zakup: ${priorityItems.map((c) => `${item(c.id).name} (${c.why})`).join('; ')}.`);
  const nextUpgrade = augmentation?.upgrades.find(u=>exists(u.to));

  const build = {
    alias,
    mode: state.mode || 'classic',
    roleStarter: state.mode === 'classic' && ['utility','support','jungle'].includes(state.me?.position)
      ? startingItems(ctx,data).find(id => isRoleStarter(id, ctx.position) && exists(id)) || null : null,
    mayhem: augmentation ? { hints:augmentation.hints, unknown:augmentation.unknown, selection:state.mayhem || {}, repeat:[...pinRepeats], questItems:[...questItems], skipped:[...skipped],
      headliner:require('./headliners').headlinerView(state.mayhem?.headliner,state.mayhem),synergies:require('./augment-synergies').synergies(state.mayhem),
      nextItem:nextUpgrade ? { ...item(nextUpgrade.to), upgrade:true } : finalItems.find(it => !it.owned) || null } : null,
    decisions, changes, decisionSummary, choiceWarnings: warnings,
    liveAdaptation:live.map(s=>({ text:s.text, item:s.myItem, evidence:s.evidence })),
    inventory: { itemSlots: fullBuild, reservedSlots, bootsSlot: soldBoots ? 'none' : bootsInQuest ? 'quest' : 'inventory' },
    quest: questView ? { ...questView, bootsUpgrade, slotItem: bootsInQuest ? { ...item(boots), why: 'Po queście: boczny slot', step: 2 }
      : quest.extraSlot === 'control-wards' && exists(2055) ? { ...item(2055), why: 'Po queście: do 2 szt.' } : null } : null,
    name: game.championsByAlias.get(alias)?.name || alias,
    estimated: !!(champ.unknown || (champ.fromStats && !champ.statsBuild)),
    fromStats: !!champ.statsBuild,
    baseSource:!champ.statsBuild?champ.baseSource||null:null,
    enemy: describeEnemy(enemy),
    spells: spells.ids.map(spell),
    spellsWhy: spells.why,
    reservedSlot: supportItem ? item(supportItem.id).name : reservedSlots ? 'Przedmiot wsparcia' : null,
    boots: soldBoots ? {id:null,name:'',icon:'',why:'',slot:'boots'} : augmentation?.freeBoots && !augmentation.ownedBoots ? { id:null,name:'Buty z augmentu',icon:'',why:'Darmowe — zaznacz otrzymane',owned:true,slot:'boots' }
      : !boots && skipped.size ? {id:null,name:'Brak proponowanych butów',why:'Warianty z planu zostały pominięte',slot:'boots'}
      : { ...item(boots), why: bootsWhy, pinned: bootsPinned, owned:!!ownedBoots, slot: 'boots' },
    items: finalItems,
    alternatives: alternatives.map((a) => ({ ...item(a.id), why: reasonOf(Object.entries(a.tags).sort((x, y) => y[1] * (threats[y[0]] || 0) - x[1] * (threats[x[0]] || 0))[0][0]) })),
    situations: situations.map((s) => situationView(s, game, finalIds)),
    skills: champ.skills || 'Q > W > E',
    notes,
  };
  if(build.mayhem){
    const ratings=require('./mayhem-compare').selectedAugmentGrades({champion:champ,selection:state.mayhem||{},build,game,pool:state.mayhemPool||'KIWI',enemy});
    build.mayhem.hints=build.mayhem.hints.map(h=>{
      const required=[...augmentation.bonuses].filter(([,b])=>b.contributions.some(c=>c.direct&&(c.group===`augment ${h.name}`||c.group.startsWith(`augment ${h.name}:`)))).map(([id])=>id);
      let targets=[...new Set([...(h.itemTargets||[]),...required])].filter(id=>purchased.includes(id)||fitsResource(id));
      if(h.oneItem){const present=targets.filter(id=>purchased.includes(id)||finalItems.some(i=>i.id===id));targets=present.length?present:targets.slice(0,1);}
      const items=targets.map(id=>({...item(id),status:purchased.includes(id)?'owned':finalItems.some(i=>i.id===id)?'planned':'outside'}));
      return {...h,rating:ratings.find(r=>r.id===h.id)||null,requiredItems:items};
    });
  }
  if (inspectId) {
    const decision = finalItems.find(it => it.id === inspectId);
    const ranked = candidates.some(it => it.id === inspectId);
    const conflict = selectedIds.find(id => id !== inspectId && !compatible(inspectId,[id]));
    const chosenItem = chosen.find(it => it.id === inspectId);
    const bonus = augmentation?.bonuses.get(inspectId);
    // Report only facts from this execution. Availability and trial purchases are
    // handled by the lab; neither changes the ranking of the natural build.
    build.inspection = {
      ranked, conflict, lastCompetition, inPool:candidateEntries.some(it => it.id === inspectId),
      core:core.includes(inspectId), fixed:fixed.includes(inspectId), guardIE:critCore && inspectId === 3031,
      excluded:!!augmentation?.excluded.has(inspectId), resource:fitsResource(inspectId),
      damage:fitsDamage(inspectId), crit:fitsCritStyle(inspectId),
      lateStyle:!lateStats.some(it=>it.id===inspectId) || fitsLateStyle(inspectId),
      why:decision?.why, source:decision?.source, popular:!!chosenItem?.popular,
      reasonRule:situations.filter(s => s.myItem===inspectId).map(reasonFor),
      bonus:bonus ? [...new Set(bonus.reasons)] : []
    };
  }
  return build;
}

const SET_TITLE = 24;
const SET_ROW = 6;
const shortTitle = (t) => { const x = String(t).replace(/\s+/g, ' ').trim(); return x.length <= SET_TITLE ? x : `${x.slice(0, SET_TITLE - 1).trimEnd()}…`; };

// Zestaw przedmiotów do sklepu w grze (format /lol-item-sets). Nazwy bloków tłumaczą, skąd wziął się item.
function itemSetFor(build, alias, state, game, data) {
  const ctx = matchContext(alias, state, game, data);
  const exists = (id) => itemAvailable(id, game, state.mode, alias) && itemFitsResource(id,game,alias);
  const repeat = new Set(build.mayhem?.repeat || []);
  const list = (ids) => [...new Set(ids)].filter(exists).map((id) => ({ id: String(id), count: repeat.has(id) ? ids.filter(x=>x===id).length : 1 }));
  const laneName = ctx.lane ? nameOf(ctx.lane.alias, game) : '';
  const trinkets = data.trinkets || {};
  const blocks = [];
  // Sklep w grze ma wąską kolumnę: długie nazwy bloków i długie rzędy przesuwają cały zestaw i ucinają lewą krawędź.
  // Dlatego nazwy mają do SET_TITLE znaków, a blok najwyżej SET_ROW itemów (dłuższy idzie w dwa rzędy).
  const block = (type, ids) => {
    const items = list(ids);
    for (let i = 0; i < items.length; i += SET_ROW) {
      const title = i === 0 ? type : `${type.replace(/\s*\(.*\)$/, '')} cd.`;
      blocks.push({ type: shortTitle(title), items: items.slice(i, i + SET_ROW), showIfSummonerSpell: '', hideIfSummonerSpell: '' });
    }
  };

  const aram = ctx.position === 'aram';
  if (!aram) block(laneName ? `Start vs ${laneName}` : 'Start', [...startingItems(ctx,data), trinkets.start]);
  if (ctx.lane && data.earlyDefense && ctx.position !== 'support') {
    const comp = ctx.lane.dmg === 'ap' ? data.earlyDefense.ap : ctx.lane.dmg === 'ad' ? data.earlyDefense.ad : null;
    if (comp) block('Gdy przegrywasz linię', [comp, 2055]);
  }
  // Szósty przedmiot bota pojawia się w osobnym bloku, żeby kolejność
  // zakupów przed questem nie obiecywała siedmiu zwykłych slotów.
  const beforeQuest = build.inventory?.bootsSlot === 'quest' ? build.items.slice(0, 5) : build.items;
  const [first, ...rest] = beforeQuest;
  block('Build (kolejno)', [first && first.id, build.inventory?.bootsSlot === 'none' ? null : build.boots.id, ...rest.map((i) => i.id)]);
  if (build.inventory?.bootsSlot === 'quest') block('6. item po queście bota', build.items.slice(5).map((i) => i.id));
  // Każdy powód osobnym blokiem, np. "kryty: Yasuo, Jhin".
  const reasons = new Map();
  for (const it of [...(build.inventory?.bootsSlot === 'none' ? [] : [build.boots]), ...build.items]) {
    if (!it.why || ['rdzeń championa', 'standardowe'].includes(it.why)) continue;
    reasons.set(it.why, [...(reasons.get(it.why) || []), it.id]);
  }
  for (const [why, ids] of reasons) block(why, ids);
  if (build.alternatives.length) block('Sytuacyjne', build.alternatives.map((a) => a.id));
  const stealth = (build.situations || []).find((s) => s.key === 'stealth');
  if (!aram) block(stealth ? `Wizja: ${stealth.champions.map((c) => c.name).join(', ')}` : 'Wizja i mikstury', [...(data.consumables || []), ctx.position === 'support' ? trinkets.support : trinkets.later]);

  return {
    title: `CS Assist${state.mode === 'mayhem' ? ' Mayhem' : aram ? ' ARAM' : ''}: ${build.name}${laneName ? ` vs ${laneName}` : ''}`.slice(0, 75),
    associatedChampions: [game.championsByAlias.get(alias)?.id].filter(Boolean),
    // Mapa 11: Summoner's Rift, 12: Howling Abyss (ARAM). Zestaw przypięty do złej mapy nie pokazuje się w sklepie.
    associatedMaps: [aram ? 12 : 11],
    blocks,
    map: 'any',
    mode: 'any',
    preferredItemSlots: [],
    sortrank: 0,
    startedFrom: 'blank',
    type: 'custom',
  };
}

function enemyProfile(state, game, data) {
  return describeEnemy(buildEnemyProfile(state, game, data));
}

// Ustawia Flasha na tym samym klawiszu, na którym gracz trzyma go obecnie.
function orderSpells(spellIds, current) {
  const FLASH = 4;
  const [a, b] = spellIds;
  const other = a === FLASH ? b : a;
  if (!spellIds.includes(FLASH)) return { spell1Id: a, spell2Id: b };
  return current && current.spell1Id === FLASH ? { spell1Id: FLASH, spell2Id: other } : { spell1Id: other, spell2Id: FLASH };
}

module.exports = {
  playerForRole,
  POSITION_LABELS, SPELL, readSession, aramChoices, champInfo, isRanged, matchupVerdict, laneOpponentOf, spellsFor, itemSetFor, adaptRunes, suggestPicks, suggestBans, compositions, counterCount, enemyProfile, threatWeights, teamProfile, archetypeOf, describeEnemy, runePageFor, normalizeRunes, buildFor, orderSpells,
};
