// Logika asystenta: odczyt stanu wyboru postaci, sugestie picków, runy i build.
// Czyste funkcje, bez Electrona i sieci, żeby dało się je testować.

const POSITION_LABELS = {
  top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'ADC', utility: 'Support', '': 'Brak roli',
};
// LCU nazywa supporta "utility", dane używają "support".
const toDataRole = (pos) => (pos === 'utility' ? 'support' : pos);

// ---------- stan wyboru postaci ----------

function readSession(session) {
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
  ].map(Number).filter((id) => id > 0));

  const phase = (session.timer && session.timer.phase) || '';
  const allLocked = phase === 'FINALIZATION' || phase === 'GAME_STARTING'
    || (pickActions.length > 0 && pickActions.every((a) => a.completed));

  const banActions = actions.filter((a) => a.type === 'ban');
  const banPhase = phase === 'PLANNING' || banActions.some((a) => a.isInProgress && !a.completed);
  const myBanTurn = banActions.some((a) => a.actorCellId === me && a.isInProgress && !a.completed);

  return { me: allies.find((a) => a.isMe) || null, allies, enemies, bans, phase, allLocked, banPhase, myBanTurn };
}

// ---------- informacje o championach ----------

const CLASS_FROM_ROLES = { marksman: 'adc', mage: 'mage', assassin: 'assassin', tank: 'tank', fighter: 'fighter', support: 'support' };

function champInfo(alias, game, data) {
  const known = data.champions[alias];
  if (known) return { alias, ...known };
  // Champion spoza wbudowanych danych: przybliżenie po klasie z klienta.
  const summary = game.championsByAlias.get(alias);
  const lcuRoles = (summary && summary.roles) || [];
  const has = (trait) => ((data.championTraits || {})[trait] || []).includes(alias);
  let cls = CLASS_FROM_ROLES[lcuRoles[0]] || 'fighter';
  if (has('tank')) cls = 'tank';
  else if (has('support')) cls = 'support';
  const ap = has('ap') || lcuRoles.includes('mage') || cls === 'support';
  const dmg = ap ? 'ap' : cls === 'tank' ? 'mixed' : 'ad';
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
    dive: 0, burst: 0, cc: 0, marksmen: 0, count: infos.length,
  };
  for (const c of infos) {
    const w = DAMAGE_WEIGHT[c.class] || 1;
    if (c.dmg === 'ad') { p.ad += 1; p.adWeighted += w; }
    else if (c.dmg === 'ap') { p.ap += 1; p.apWeighted += w; }
    else { p.ad += 0.5; p.ap += 0.5; p.adWeighted += w / 2; p.apWeighted += w / 2; }
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
  const laneOpponent = position ? enemyInfos.find((e) => e.roles && e.roles[0] === position) : null;
  const blind = !laneOpponent;

  const results = [];
  for (const [alias, champ] of Object.entries(data.champions)) {
    const summary = game.championsByAlias.get(alias);
    if (!summary || taken.has(summary.id) || allyAliases.has(alias)) continue;
    if (game.owned && game.owned.size > 0 && !game.owned.has(summary.id)) continue;
    if (position && !champ.roles.includes(position)) continue;

    let score = 50;
    const reasons = [];
    if (!position) score += champ.roles.length > 1 ? 2 : 0;
    if (position && champ.roles[0] === position) score += 3;
    // Rola poboczna (np. mag na supporcie): grywalne, ale rzadziej niż główne picki tej roli.
    if (position && champ.roles[0] !== position) { score -= 6; reasons.push({ good: false, text: 'rzadziej grany na tej roli' }); }

    const tier = tierOf(alias, data);
    const tierPts = (TIER_VALUE[tier] || 2) - 2;
    score += tierPts * (blind ? 6 : 3);
    if (tier === 'S' || (tier === 'A' && blind)) reasons.push({ good: true, text: `mocny w mecie (tier ${tier})` });

    if (blind) {
      const counters = counterCount(alias, data);
      score += Math.max(-8, 6 - counters * 2);
      if (counters <= 3) reasons.push({ good: true, text: `bezpieczny blind pick (${counters} kontr)` });
      else if (counters >= 6) reasons.push({ good: false, text: `łatwy do skontrowania (${counters} kontr)` });
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
      if (ally.ap === 0 && champ.dmg === 'ap') { score += 10; reasons.push({ good: true, text: 'drużynie brakuje obrażeń magicznych' }); }
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
    if (enemy.tanks >= 2 && t.includes('tankkiller')) {
      score += 7; reasons.push({ good: true, text: 'dobry na tanki przeciwnika' });
    }

    // Najpierw minusy, potem plusy według wagi: gracz od razu widzi ryzyko.
    reasons.sort((x, y) => Number(x.good) - Number(y.good));
    results.push({
      alias, championId: summary.id, name: summary.name, score: Math.round(score), tier,
      mastery: masteryOf(summary.id, game), reasons: reasons.slice(0, 5),
    });
  }
  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { position, blind, laneOpponent: laneOpponent ? name(laneOpponent.alias) : null, list: results.slice(0, limit) };
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

function resolveRunes(champ, data) {
  const tpl = data.classTemplates[champ.class] || data.classTemplates.fighter;
  const ref = champ.runes || tpl.runes;
  return typeof ref === 'string' ? data.runePresets[ref] : ref;
}

// Dopasowuje stronę run do aktualnego patcha z klienta: nieistniejące runy zastępuje pierwszą w danym rzędzie.
function normalizeRunes(page, game) {
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
const isRanged = (c) => !MELEE_CLASSES.includes(c.class);

// Przeciwnik z Twojej linii (gdy jest już widoczny w champ selekcie).
function laneOpponentOf(state, game, data) {
  const position = toDataRole(state && state.me ? state.me.position : '');
  if (!position) return null;
  return teamInfos(state.enemies || [], game, data).find((e) => e.roles && e.roles[0] === position) || null;
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

function matchContext(alias, state, game, data) {
  const champ = champInfo(alias, game, data);
  const position = toDataRole(state && state.me ? state.me.position : '') || (champ.roles || [])[0] || '';
  const enemyInfos = state ? teamInfos(state.enemies || [], game, data) : [];
  const lane = position === 'jungle' ? null : laneOpponentOf(state, game, data);
  return { champ, position, lane, enemy: teamProfile(enemyInfos), enemyCount: enemyInfos.length, verdict: matchupVerdict(champ, lane) };
}

const PERK = { secondWind: 8444, bonePlating: 8473, overgrowth: 8451, resolve: 8400 };
const SHARD = { health: 5011, tenacity: 5013 };

// Drobne zmiany strony run pod przeciwnika z linii i skład wroga.
// Zmieniamy tylko runy z tego samego rzędu, więc strona zawsze pozostaje poprawna.
function adaptRunes(page, ctx, game) {
  const changes = [];
  if (!game.styles || !game.styles.size) return { page, changes };
  const out = { ...page, perks: [...page.perks], shards: [...page.shards] };
  const perkName = (id) => game.perks.get(id)?.name || String(id);
  const regularSlots = (styleId) => (game.styles.get(styleId)?.slots || []).filter((s) => s.type !== 'kStatMod');
  const swap = (want, why) => {
    for (let i = 0; i < out.perks.length; i++) {
      const slot = regularSlots(i < 4 ? out.p : out.s).find((s) => s.perks.includes(out.perks[i]));
      if (slot && slot.perks.includes(want)) {
        if (out.perks[i] !== want) {
          changes.push(`${perkName(want)} zamiast ${perkName(out.perks[i])}: ${why}`);
          out.perks[i] = want;
        }
        return true;
      }
    }
    return false;
  };

  const { lane, champ } = ctx;
  if (lane) {
    const laneName = nameOf(lane.alias, game);
    const lt = lane.traits || [];
    const poke = isRanged(lane) || lt.includes('poke');
    const allIn = lane.class === 'assassin' || lt.includes('burst') || (lt.includes('early') && !isRanged(lane));
    if (!isRanged(champ) && poke) {
      const why = `${laneName} zadaje obrażenia z dystansu`;
      const resolve = regularSlots(PERK.resolve);
      // Brak Determinacji na stronie: na górnej i środkowej linii bierzemy ją jako drugie drzewko.
      if (!swap(PERK.secondWind, why) && out.p !== PERK.resolve && ['top', 'middle'].includes(ctx.position)
        && resolve[2] && resolve[2].perks.includes(PERK.secondWind) && resolve[3]) {
        const before = game.styles.get(out.s)?.name || '';
        const last = resolve[3].perks.includes(PERK.overgrowth) ? PERK.overgrowth : resolve[3].perks[0];
        out.s = PERK.resolve;
        out.perks = [...out.perks.slice(0, 4), PERK.secondWind, last];
        changes.push(`${game.styles.get(PERK.resolve).name} zamiast ${before} jako drugie drzewko (${perkName(PERK.secondWind)}): ${why}`);
      }
    } else if (allIn) {
      swap(PERK.bonePlating, `krótkie wymiany i burst ${laneName}`);
    }
  }

  // Odłamki: trzeci rząd (obrona).
  const def = (game.styles.get(out.p)?.slots || []).filter((s) => s.type === 'kStatMod')[2];
  const shard = (want, why) => {
    if (def && def.perks.includes(want) && out.shards[2] !== want) {
      changes.push(`odłamek ${perkName(want)} zamiast ${perkName(out.shards[2])}: ${why}`);
      out.shards[2] = want;
    }
  };
  if (ctx.enemy.cc >= 3) shard(SHARD.tenacity, `wrogowie mają dużo CC (${ctx.enemy.cc} postaci)`);
  return { page: out, changes };
}

const SPELL = { flash: 4, ignite: 14, tp: 12, heal: 7, exhaust: 3, smite: 11, barrier: 21, cleanse: 1 };

// Czary przywoływacza: baza championa + zamiana drugiego czaru (nie Flasha) pod mecz.
function spellsFor(alias, state, game, data) {
  const ctx = matchContext(alias, state, game, data);
  const tpl = data.classTemplates[ctx.champ.class] || data.classTemplates.fighter;
  const ids = [...(ctx.champ.spells || tpl.spells)];
  let why = '';
  const has = (id) => !game.spells.size || game.spells.has(id);
  const other = () => ids.find((id) => id !== SPELL.flash);
  const setOther = (to, reason) => {
    if (!has(to) || ids.includes(to)) return;
    ids[ids.findIndex((id) => id !== SPELL.flash)] = to;
    why = reason;
  };
  if (ctx.position === 'jungle' || ids.includes(SPELL.smite)) return { ids, why };
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
  const champ = champInfo(alias, game, data);
  const ctx = matchContext(alias, state, game, data);
  const { page, changes } = adaptRunes(normalizeRunes(resolveRunes(champ, data), game), ctx, game);
  const name = game.championsByAlias.get(alias)?.name || alias;
  const describe = (id) => ({ id, name: game.perks.get(id)?.name || String(id), icon: game.perks.get(id)?.iconPath || '' });
  const spells = spellsFor(alias, state, game, data);
  return {
    name: `CS Assist: ${name}${ctx.lane ? ` vs ${nameOf(ctx.lane.alias, game)}` : ''}`.slice(0, 50),
    primaryStyleId: page.p,
    subStyleId: page.s,
    selectedPerkIds: [...page.perks, ...page.shards],
    primaryStyle: game.styles.get(page.p)?.name || String(page.p),
    subStyle: game.styles.get(page.s)?.name || String(page.s),
    keystone: describe(page.perks[0]),
    perks: page.perks.slice(1).map(describe),
    shards: page.shards.map(describe),
    adaptations: changes,
    laneOpponent: ctx.lane ? nameOf(ctx.lane.alias, game) : null,
    spells: spells.ids.map((sid) => ({ id: sid, name: game.spells.get(sid)?.name || String(sid), icon: game.spells.get(sid)?.iconPath || '' })),
    spellsWhy: spells.why,
  };
}

// ---------- build ----------

function itemPoolKey(champ) {
  if (champ.class === 'tank' || champ.class === 'support') return champ.class;
  if (champ.dmg === 'ap') return 'mage';
  return champ.class === 'adc' || champ.class === 'assassin' ? champ.class : 'fighter';
}

const FULL_BUILD = 5; // + buty = 6 slotów
const FIXED_CORE = 2; // pierwsze itemy championa zostają zawsze, reszta konkuruje z itemami sytuacyjnymi

// Adaptacyjny build: każdy item dostaje punkty za to, jak odpowiada na zagrożenia w składzie wroga.
// Po wybraniu itemu dane zagrożenie słabnie, więc przy skrajnym składzie (np. 4 AP) wejdzie kilka itemów na MR,
// a przy zbalansowanym tylko jeden.
function buildFor(alias, state, game, data) {
  const champ = champInfo(alias, game, data);
  const tpl = data.classTemplates[champ.class] || data.classTemplates.fighter;
  const aliasOf = (id) => game.championsById.get(id)?.alias;
  const enemyInfos = state.enemies.filter((e) => e.championId).map((e) => champInfo(aliasOf(e.championId), game, data)).filter((c) => c.alias);
  const enemy = teamProfile(enemyInfos);
  const threats = threatWeights(enemy);
  const exists = (id) => !game.items.size || game.items.has(id);

  // Buty
  let boots = champ.boots || tpl.boots;
  let bootsWhy = 'standardowe';
  const durable = ['fighter', 'tank', 'assassin'].includes(champ.class);
  if (durable && (enemy.apShare >= 0.6 || (enemy.cc >= 3 && enemy.apShare >= 0.45))) { boots = data.boots.vsAp; bootsWhy = 'MR i odporność na CC'; }
  else if (durable && enemy.adShare >= 0.6) { boots = data.boots.vsAd; bootsWhy = 'pancerz przeciw AD'; }
  else if (champ.class === 'mage' && enemy.apShare >= 0.65 && enemy.cc >= 3) { boots = data.boots.vsAp; bootsWhy = 'MR i odporność na CC'; }

  const core = (champ.items || tpl.items).filter(exists);
  // Ze statystykami OP.GG cały rdzeń (3 itemy) jest z aktualnego patcha, więc zostaje w całości.
  const fixed = core.slice(0, champ.statsBuild ? 3 : FIXED_CORE);
  const pooledTags = (id) => (Object.values(data.itemPools || {}).flat().find((it) => it.id === id) || {}).tags || {};
  const lateStats = (champ.lateItems || []).filter((it) => exists(it.id));
  const topLate = Math.max(1, ...lateStats.map((it) => it.score));
  // Pozostałe itemy rdzenia i popularne późniejsze itemy z OP.GG startują z wysoką bazą,
  // żeby itemy sytuacyjne z wbudowanej puli wchodziły tylko przy wyraźnie jednostronnym składzie wroga.
  const candidates = [
    ...core.slice(fixed.length).map((id) => ({ id, tags: { ...pooledTags(id), late: 1.6 }, core: true })),
    ...lateStats.map((it) => ({ id: it.id, tags: { ...pooledTags(it.id), late: 2 + 1.5 * (it.score / topLate) }, core: true, popular: true })),
    ...((data.itemPools || {})[itemPoolKey(champ)] || []).filter((it) => !it.only || it.only.includes(champ.class))
      // Przy statystykach OP.GG item z puli nie wygrywa samą „późną grą”, tylko odpowiedzią na zagrożenie.
      .map((it) => (lateStats.length ? { ...it, tags: { ...it.tags, late: 0 } } : it)),
  ].filter((it, i, arr) => exists(it.id) && !fixed.includes(it.id) && arr.findIndex((x) => x.id === it.id) === i);

  const left = { ...threats };
  const scoreOf = (it) => Object.entries(it.tags).reduce((sum, [tag, v]) => sum + v * (left[tag] || 0), 0);
  const chosen = [];
  const pool = [...candidates];
  while (chosen.length < FULL_BUILD - fixed.length && pool.length) {
    pool.sort((a, b) => scoreOf(b) - scoreOf(a));
    const best = pool.shift();
    const contributions = Object.entries(best.tags).map(([tag, v]) => [tag, v * (left[tag] || 0)]).sort((a, b) => b[1] - a[1]);
    const mainTag = contributions[0] && contributions[0][1] > 0 ? contributions[0][0] : 'late';
    chosen.push({ ...best, why: best.popular && mainTag === 'late' ? 'popularny w tym patchu' : best.core && mainTag === 'late' ? 'rdzeń championa' : THREAT_REASONS[mainTag] });
    // Każdy item częściowo zaspokaja zagrożenie: przy skrajnym składzie zostaje miejsce na kolejny item tego typu.
    for (const [tag, v] of Object.entries(best.tags)) {
      left[tag] = tag === 'late' ? (left[tag] || 0) * 0.85 : Math.max(0, (left[tag] || 0) - v * 0.55);
    }
  }
  pool.sort((a, b) => scoreOf(b) - scoreOf(a));
  const alternatives = pool.filter((it) => scoreOf(it) > 0.5 && Object.keys(it.tags).some((t) => t !== 'late' && threats[t] > 0.6)).slice(0, 3);

  const item = (id) => {
    const it = game.items.get(id);
    return it ? { id, name: it.name, icon: it.iconPath } : { id, name: String(id), icon: '' };
  };
  const spell = (id) => ({ id, name: game.spells.get(id)?.name || String(id), icon: game.spells.get(id)?.iconPath || '' });

  const spells = spellsFor(alias, state, game, data);
  const notes = [];
  const replacedCore = core.slice(FIXED_CORE).filter((id) => !chosen.some((c) => c.id === id));
  if (replacedCore.length) notes.push(`${replacedCore.map((id) => item(id).name).join(', ')} wypada z buildu na rzecz itemów defensywnych pod ten skład.`);
  const defensive = chosen.filter((c) => [THREAT_REASONS.mr, THREAT_REASONS.armor].includes(c.why));
  if (defensive.length >= 2) notes.push(`Skład wroga jest jednostronny, dlatego build ma ${defensive.length} itemy obronne.`);

  return {
    alias,
    name: game.championsByAlias.get(alias)?.name || alias,
    estimated: !!champ.unknown || (champ.fromStats && !champ.statsBuild),
    fromStats: !!champ.statsBuild,
    enemy: describeEnemy(enemy),
    spells: spells.ids.map(spell),
    spellsWhy: spells.why,
    boots: { ...item(boots), why: bootsWhy },
    items: [
      // Item rdzenia, który przy okazji odpowiada na mocne zagrożenie (np. Zhonya przeciw AD), dostaje ten powód.
      ...fixed.map((id) => {
        const strong = Object.entries(pooledTags(id)).filter(([t, v]) => t !== 'late' && v * (threats[t] || 0) >= 1.5).sort((a, b) => b[1] * threats[b[0]] - a[1] * threats[a[0]])[0];
        return { ...item(id), why: strong ? THREAT_REASONS[strong[0]] : 'rdzeń championa' };
      }),
      ...chosen.map((c) => ({ ...item(c.id), why: c.why })),
    ],
    alternatives: alternatives.map((a) => ({ ...item(a.id), why: THREAT_REASONS[Object.entries(a.tags).sort((x, y) => y[1] * (threats[y[0]] || 0) - x[1] * (threats[x[0]] || 0))[0][0]] })),
    skills: champ.skills || 'Q > W > E',
    notes,
  };
}

// Zestaw przedmiotów do sklepu w grze (format /lol-item-sets). Nazwy bloków tłumaczą, skąd wziął się item.
function itemSetFor(build, alias, state, game, data) {
  const ctx = matchContext(alias, state, game, data);
  const exists = (id) => id && (!game.items.size || game.items.has(id));
  const list = (ids) => [...new Set(ids)].filter(exists).map((id) => ({ id: String(id), count: 1 }));
  const laneName = ctx.lane ? nameOf(ctx.lane.alias, game) : '';
  const startKey = ctx.position === 'jungle' ? 'jungle' : ctx.position === 'support' ? 'support' : itemPoolKey(ctx.champ);
  const trinkets = data.trinkets || {};
  const blocks = [];
  const block = (type, ids) => { const items = list(ids); if (items.length) blocks.push({ type: type.slice(0, 60), items, showIfSummonerSpell: '', hideIfSummonerSpell: '' }); };

  block(laneName ? `Start (vs ${laneName})` : 'Start', [...(ctx.champ.starters || (data.starters || {})[startKey] || []), trinkets.start]);
  if (ctx.lane && data.earlyDefense) {
    const comp = ctx.lane.dmg === 'ap' ? data.earlyDefense.ap : ctx.lane.dmg === 'ad' ? data.earlyDefense.ad : null;
    if (comp) block(`Pierwszy powrót, gdy przegrywasz wymiany z ${laneName}`, [comp, 2055]);
  }
  const [first, ...rest] = build.items;
  block('Build pod ten skład (kolejność)', [first && first.id, build.boots.id, ...rest.map((i) => i.id)]);
  // Każdy powód osobnym blokiem, np. "Dlaczego: dużo obrażeń magicznych".
  const reasons = new Map();
  for (const it of [build.boots, ...build.items]) {
    if (!it.why || ['rdzeń championa', 'standardowe'].includes(it.why)) continue;
    reasons.set(it.why, [...(reasons.get(it.why) || []), it.id]);
  }
  for (const [why, ids] of reasons) block(`Dlaczego: ${why}`, ids);
  if (build.alternatives.length) block('Alternatywy sytuacyjne', build.alternatives.map((a) => a.id));
  block('Wizja i mikstury', [...(data.consumables || []), ctx.position === 'support' ? trinkets.support : trinkets.later]);

  return {
    title: `CS Assist: ${build.name}${laneName ? ` vs ${laneName}` : ''}`.slice(0, 75),
    associatedChampions: [game.championsByAlias.get(alias)?.id].filter(Boolean),
    associatedMaps: [11],
    blocks,
    map: 'SR',
    mode: 'any',
    preferredItemSlots: [],
    sortrank: 0,
    startedFrom: 'blank',
    type: 'custom',
  };
}

function enemyProfile(state, game, data) {
  const aliasOf = (id) => game.championsById.get(id)?.alias;
  const infos = state.enemies.filter((e) => e.championId).map((e) => champInfo(aliasOf(e.championId), game, data)).filter((c) => c.alias);
  return describeEnemy(teamProfile(infos));
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
  POSITION_LABELS, readSession, champInfo, isRanged, matchupVerdict, laneOpponentOf, spellsFor, itemSetFor, adaptRunes, suggestPicks, suggestBans, compositions, counterCount, enemyProfile, threatWeights, teamProfile, archetypeOf, describeEnemy, runePageFor, normalizeRunes, buildFor, orderSpells,
};
