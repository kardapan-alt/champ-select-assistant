// Statystyki z oficjalnego, publicznego API OP.GG (serwer MCP, https://mcp-api.op.gg/mcp).
// Narzędzia i ich parametry są odczytywane z serwera (tools/list), a odpowiedzi parsowane ostrożnie,
// bo format może się zmieniać. Wynik to "nakładka" na nasze dane: tiery, role, kontry, buildy, runy.
const https = require('https');
const http = require('http');

const DEFAULT_ENDPOINT = 'https://mcp-api.op.gg/mcp';

// ---------- klient MCP (Streamable HTTP) ----------

class McpClient {
  constructor(endpoint = DEFAULT_ENDPOINT) {
    this.url = new URL(endpoint);
    this.sessionId = null;
    this.nextId = 1;
    this.tools = null;
  }

  post(body) {
    const lib = this.url.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = lib.request(this.url, {
        method: 'POST',
        timeout: 20000,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(payload),
          ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.headers['mcp-session-id']) this.sessionId = res.headers['mcp-session-id'];
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) return reject(new Error(`OP.GG HTTP ${res.statusCode}`));
          resolve(parseRpcResponse(text, body.id));
        });
      });
      req.on('timeout', () => req.destroy(new Error('OP.GG: przekroczono czas')));
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  async rpc(method, params) {
    const id = this.nextId++;
    const res = await this.post({ jsonrpc: '2.0', id, method, params });
    if (res && res.error) throw new Error(`OP.GG: ${res.error.message || 'błąd'}`);
    return res && res.result;
  }

  async init() {
    if (this.tools) return this.tools;
    await this.rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'champ-select-assistant', version: '0.4.0' },
    });
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => {});
    const list = await this.rpc('tools/list', {});
    this.tools = (list && list.tools) || [];
    return this.tools;
  }

  async call(name, args) {
    const result = await this.rpc('tools/call', { name, arguments: args });
    if (!result) return null;
    if (result.structuredContent) return result.structuredContent;
    const text = (result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    if (result.isError) throw new Error(`OP.GG: ${text.slice(0, 200)}`);
    return text;
  }
}

// Odpowiedź może przyjść jako zwykły JSON albo strumień SSE ("data: {...}").
function parseRpcResponse(text, id) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.find((m) => m.id === id) || parsed[0] : parsed;
  }
  const messages = trimmed.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => {
    try { return JSON.parse(l.slice(5).trim()); } catch { return null; }
  }).filter(Boolean);
  return messages.find((m) => m.id === id) || messages[messages.length - 1] || null;
}

// ---------- parsowanie treści odpowiedzi ----------

// Zamienia tekst odpowiedzi na obiekt: JSON, zapis w stylu Name(pole=wartość, ...) albo CSV.
function parsePayload(payload) {
  if (payload == null || typeof payload === 'object') return payload;
  const text = String(payload).trim();
  try { return JSON.parse(text); } catch { /* inny format */ }
  // Format OP.GG MCP: nagłówek "class Nazwa: pole1,pole2" i treść z wywołaniami bez nazw pól, np. Top("Malphite",false,...).
  const schema = {};
  for (const m of text.matchAll(/^class\s+([A-Za-z_]\w*)\s*:\s*(.*)$/gm)) schema[m[1]] = m[2].split(',').map((f) => f.trim()).filter(Boolean);
  const body = Object.keys(schema).length ? text.replace(/^class\s+.*$/gm, '') : text;
  const reprStart = body.search(/[A-Za-z_][\w.]*\(/);
  if (reprStart >= 0) {
    try { return parseRepr(body.slice(reprStart), schema); } catch { /* inny format */ }
  }
  if (text.includes(',') && text.includes('\n')) return parseCsv(text);
  return text;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const split = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const header = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row = {};
    header.forEach((h, i) => { row[h] = toScalar(cells[i]); });
    return row;
  });
}

function toScalar(v) {
  if (v === undefined) return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === 'True' || v === 'true') return true;
  if (v === 'False' || v === 'false') return false;
  if (v === 'None' || v === 'null' || v === '') return null;
  return v;
}

// Prosty parser zapisu Name(a=1, b=[X(c=2)], d='tekst').
function parseRepr(text, schema = {}) {
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const value = () => {
    ws();
    const ch = text[i];
    if (ch === '[' || ch === '(' && !/\w/.test(text[i - 1] || '')) return list(ch === '[' ? ']' : ')');
    if (ch === '{') return dict();
    if (ch === '"' || ch === "'") return str();
    const m = /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?/.exec(text.slice(i));
    if (m) { i += m[0].length; return Number(m[0]); }
    const id = /^[A-Za-z_][\w.]*/.exec(text.slice(i));
    if (!id) throw new Error(`repr: nieoczekiwany znak ${ch}`);
    i += id[0].length;
    ws();
    if (text[i] === '(') return call(id[0]);
    const literals = { True: true, False: false, None: null, true: true, false: false, null: null };
    return id[0] in literals ? literals[id[0]] : id[0];
  };
  const str = () => {
    const q = text[i++];
    let out = '';
    while (i < text.length && text[i] !== q) {
      if (text[i] === '\\') i++;
      out += text[i++];
    }
    i++;
    return out;
  };
  const list = (close) => {
    i++;
    const out = [];
    for (;;) {
      ws();
      if (text[i] === close) { i++; return out; }
      out.push(value());
      ws();
      if (text[i] === ',') i++;
    }
  };
  const dict = () => {
    i++;
    const out = {};
    for (;;) {
      ws();
      if (text[i] === '}') { i++; return out; }
      const k = value();
      ws();
      i++; // ':'
      out[k] = value();
      ws();
      if (text[i] === ',') i++;
    }
  };
  const call = (name) => {
    i++;
    const out = { _type: name };
    const positional = [];
    for (;;) {
      ws();
      if (text[i] === ')') { i++; break; }
      const kw = /^([A-Za-z_]\w*)\s*=(?!=)/.exec(text.slice(i));
      if (kw) { i += kw[0].length; out[kw[1]] = value(); } else positional.push(value());
      ws();
      if (text[i] === ',') i++;
    }
    // Argumenty pozycyjne dostają nazwy pól z nagłówka (jeśli serwer go podał).
    const fields = schema[name];
    if (fields) positional.forEach((v, idx) => { if (idx < fields.length && !(fields[idx] in out)) out[fields[idx]] = v; else (out._args = out._args || []).push(v); });
    else if (positional.length) out._args = positional;
    return out;
  };
  return value();
}

// ---------- wyciąganie danych z dowolnej struktury ----------

function walk(node, fn, path = []) {
  if (node && typeof node === 'object') {
    fn(node, path);
    for (const [k, v] of Object.entries(node)) walk(v, fn, [...path, k]);
  }
}

const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
const pick = (obj, keys) => {
  for (const k of Object.keys(obj)) if (keys.some((re) => re.test(k))) return obj[k];
  return undefined;
};
const RE = {
  champId: [/^champion_?id$/i, /^championid$/i, /^champ_?id$/i],
  winRate: [/^win_?rate$/i, /^winrate$/i, /^win_?ratio$/i],
  myWinRate: [/^my_?win_?rate$/i],
  partnerId: [/^synergy_?champion_?id$/i, /^partner_?champion_?id$/i],
  play: [/^play$/i, /^games?$/i, /^play_?count$/i, /^pick_?count$/i, /^count$/i],
  pickRate: [/^pick_?rate$/i, /^pickrate$/i],
  tier: [/^tier$/i],
  rank: [/^rank$/i, /^tier_?rank$/i],
  position: [/^position$/i, /^lane$/i, /^role$/i],
};

// Liczba w procentach (0..100) niezależnie od tego, czy API zwraca 0.52 czy 52.
const pct = (v) => { const n = num(v); return n == null ? null : n <= 1 ? n * 100 : n; };

// Wszystkie tablice obiektów, które opisują championów z winrate'em (kontry, synergie).
// W synergiach champion_id to analizowany champion, a partner jest w synergy_champion_id.
// Winrate zawsze z perspektywy analizowanego championa: my_win_rate, a bez niego win_rate albo win/play.
function championRateLists(root) {
  const out = [];
  const idOf = (r) => num(pick(r, RE.partnerId)) ?? num(pick(r, RE.champId));
  const rateOf = (r) => {
    const mine = pick(r, RE.myWinRate);
    if (mine !== undefined) return pct(mine);
    const rate = pick(r, RE.winRate);
    if (rate !== undefined) return pct(rate);
    const play = num(pick(r, RE.play));
    const win = num(r.win);
    return play && win != null ? (win / play) * 100 : undefined;
  };
  walk(root, (node, path) => {
    if (!Array.isArray(node) || !node.length) return;
    const rows = node.filter((r) => r && typeof r === 'object' && idOf(r) != null);
    if (rows.length < Math.max(1, node.length / 2)) return;
    const withRate = rows.filter((r) => rateOf(r) !== undefined);
    if (!withRate.length) return;
    out.push({
      key: path.join('.').toLowerCase(),
      rows: withRate.map((r) => ({
        championId: idOf(r),
        winRate: rateOf(r),
        games: num(pick(r, RE.play)) || 0,
      })),
    });
  });
  return out;
}

// Tablice id (itemy, runy, czary) razem z popularnością zestawu.
function idSets(root, keyRe) {
  const out = [];
  walk(root, (node, path) => {
    if (Array.isArray(node) || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      // Klucz może być ogólny ("ids"), wtedy liczy się nazwa rodzica ("core_items.ids").
      if (!keyRe.test([...path.slice(-2), k].join('.')) || !Array.isArray(v) || !v.length || !v.every((x) => num(x) != null)) continue;
      out.push({
        key: [...path, k].join('.').toLowerCase(),
        ids: v.map(num),
        play: num(pick(node, RE.play)) || 0,
        pickRate: pct(pick(node, RE.pickRate)) || 0,
        winRate: pct(pick(node, RE.winRate)) || 0,
        parent: node,
      });
    }
  });
  return out;
}

const mostPopular = (sets) => [...sets].sort((a, b) => (b.play - a.play) || (b.pickRate - a.pickRate))[0];

// ---------- interpretacja odpowiedzi ----------

const COUNTER_EDGE = 1.5; // punkty procentowe winrate'u od 50%, od których matchup uznajemy za kontrę
const MIN_GAMES = 100;

// Analiza championa: kontry, build, runy, czary, kolejność umiejętności.
function interpretAnalysis(raw, game) {
  const root = parsePayload(raw);
  if (!root || typeof root !== 'object') return null;
  const aliasOf = (id) => game.championsById.get(id)?.alias;
  const result = { counters: [], weakVs: [], matchups: {} };

  for (const list of championRateLists(root)) {
    if (/synerg|ally|duo/.test(list.key)) {
      // Synergie są podzielone na role sojusznika (top, jungle, adc, support): zbieramy wszystkie.
      const good = list.rows.filter((r) => r.winRate >= 50 + COUNTER_EDGE && r.games >= MIN_GAMES / 2).map((r) => aliasOf(r.championId)).filter(Boolean);
      result.synergy = [...new Set([...(result.synergy || []), ...good])];
      continue;
    }
    // Wiersze to przeciwnicy z winrate'em analizowanego championa w tym matchupie.
    const rows = list.rows.filter((r) => r.games >= MIN_GAMES || !r.games);
    for (const r of rows) {
      const alias = aliasOf(r.championId);
      if (!alias || r.winRate == null) continue;
      const myWin = r.winRate;
      if (result.matchups[alias] == null) result.matchups[alias] = Math.round(myWin * 10) / 10;
      if (myWin >= 50 + COUNTER_EDGE) result.counters.push(alias);
      else if (myWin <= 50 - COUNTER_EDGE) result.weakVs.push(alias);
    }
  }
  result.counters = [...new Set(result.counters)];
  result.weakVs = [...new Set(result.weakVs)].filter((a) => !result.counters.includes(a));

  const isItem = (id) => game.items.size === 0 || game.items.has(id);
  const boots = idSets(root, /boot/i).filter((s) => s.ids.length === 1 && isItem(s.ids[0]));
  if (boots.length) result.boots = mostPopular(boots).ids[0];
  const core = idSets(root, /core|item/i).filter((s) => !/start|boot/.test(s.key) && s.ids.length >= 2 && s.ids.every(isItem));
  if (core.length) result.items = mostPopular(core).ids.slice(0, 3);
  // Późniejsze itemy (4., 5., 6. i ostatnie) z aktualnego patcha: popularność sumowana po slotach.
  const late = new Map();
  walk(root, (node, path) => {
    const key = String(path[path.length - 1] || '');
    if (!Array.isArray(node) || !/^(fourth|fifth|sixth|last)_items$/i.test(key)) return;
    const weight = /^last/i.test(key) ? 0.5 : 1;
    for (const row of node) {
      const ids = row && Array.isArray(row.ids) ? row.ids.map(num) : [];
      if (ids.length !== 1 || !isItem(ids[0])) continue;
      late.set(ids[0], (late.get(ids[0]) || 0) + weight * (pct(row.pick_rate) || 0));
    }
  });
  const taken = new Set([...(result.items || []), result.boots]);
  const lateItems = [...late.entries()].filter(([id]) => !taken.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (lateItems.length) result.lateItems = lateItems.map(([id, score]) => ({ id, score: Math.round(score) }));
  const starters = idSets(root, /start/i).filter((s) => s.ids.length >= 1 && s.ids.every(isItem));
  if (starters.length) result.starters = mostPopular(starters).ids;
  const spells = idSets(root, /spell|summoner/i).filter((s) => s.ids.length === 2 && s.ids.every((id) => id < 100));
  if (spells.length) result.spells = mostPopular(spells).ids;
  // Kolejność maksowania umiejętności: tablica liter Q/W/E pod kluczem związanym z umiejętnościami.
  walk(root, (node, path) => {
    if (result.skills || !Array.isArray(node) || !/skill|order|master/i.test(path.join('.'))) return;
    const letters = node.map((x) => String(x).toUpperCase()).filter((x) => /^[QWE]$/.test(x));
    const unique = [...new Set(letters)];
    if (node.length >= 3 && letters.length === node.length && unique.length >= 3) result.skills = unique.slice(0, 3).join(' > ');
  });

  const runeSets = idSets(root, /rune|perk/i).filter((s) => s.ids.length >= 4);
  if (runeSets.length) {
    const best = mostPopular(runeSets);
    const p = best.parent;
    const primaryStyle = num(pick(p, [/primary_?(page|style)_?id/i, /^primary_?page$/i]));
    const subStyle = num(pick(p, [/secondary_?(page|style)_?id/i, /^secondary_?page$/i, /^sub_?style/i]));
    const primary = pick(p, [/primary_?rune_?ids/i]);
    const secondary = pick(p, [/secondary_?rune_?ids/i]);
    const shards = pick(p, [/stat_?mod/i, /shard/i]);
    if (primaryStyle && subStyle && Array.isArray(primary) && Array.isArray(secondary)) {
      result.runes = {
        p: primaryStyle,
        s: subStyle,
        perks: [...primary.map(num), ...secondary.map(num)].slice(0, 6),
        shards: Array.isArray(shards) ? shards.map(num).slice(0, 3) : [5008, 5008, 5011],
      };
    }
  }
  return result;
}

const TIER_LETTER = (rank) => (rank <= 1 ? 'S' : rank === 2 ? 'A' : rank === 3 ? 'B' : 'C');
const POSITION_MAP = { top: 'top', jungle: 'jungle', mid: 'middle', middle: 'middle', adc: 'bottom', bottom: 'bottom', bot: 'bottom', support: 'support', utility: 'support' };

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Champion z wiersza: po id albo po nazwie (OP.GG w mecie podaje tylko nazwę, np. "Malphite", "Nunu & Willump").
function championResolver(game) {
  const byName = new Map();
  for (const c of game.championsById.values()) {
    byName.set(normName(c.name), c.alias);
    byName.set(normName(c.alias), c.alias);
  }
  return (node) => {
    const id = num(pick(node, RE.champId));
    if (id != null) return game.championsById.get(id)?.alias;
    const name = pick(node, [/^champion$/i, /^champion_?name$/i]);
    return typeof name === 'string' ? byName.get(normName(name)) : undefined;
  };
}

const MIN_ROLE_RATE = 0.1; // rzadsze pozycje (np. Malphite na midzie) nie są traktowane jako rola championa

// Meta (tiery i role): lista wierszy champion + pozycja + tier (1 = OP ... 5 = słaby).
function interpretMeta(raw, game) {
  const root = parsePayload(raw);
  const out = { tiers: { S: [], A: [], B: [], C: [] }, roles: {} };
  const aliasOf = championResolver(game);
  const rows = {};
  walk(root, (node, path) => {
    if (Array.isArray(node) || typeof node !== 'object') return;
    const alias = aliasOf(node);
    if (!alias) return;
    const posRaw = pick(node, RE.position) ?? path.map((p) => String(p).toLowerCase()).reverse().find((p) => POSITION_MAP[p]);
    const position = POSITION_MAP[String(posRaw || '').toLowerCase()];
    if (!position) return;
    const roleRate = num(pick(node, [/^role_?rate$/i]));
    if (node.is_rip === true || (roleRate != null && pct(roleRate) < MIN_ROLE_RATE * 100)) return;
    const tierRaw = pick(node, RE.tier) ?? pick(node, RE.rank);
    const tierNum = num(tierRaw);
    rows[alias] = rows[alias] || [];
    if (rows[alias].some((r) => r.position === position)) return;
    rows[alias].push({
      position,
      games: num(pick(node, RE.play)) || 0,
      pickRate: pct(pick(node, RE.pickRate)) || 0,
      letter: typeof tierRaw === 'string' && /^[SABCD]/i.test(tierRaw) ? tierRaw[0].toUpperCase() : tierNum != null ? TIER_LETTER(tierNum) : null,
    });
  });
  for (const [alias, list] of Object.entries(rows)) {
    // Najpierw pozycja z największą liczbą gier; tier championa to tier na tej pozycji.
    list.sort((a, b) => (b.games - a.games) || (b.pickRate - a.pickRate));
    out.roles[alias] = list.map((r) => r.position);
    const letter = list[0].letter;
    if (letter) (out.tiers[letter === 'D' ? 'C' : letter] || out.tiers.C).push(alias);
  }
  return out;
}

// ---------- profil gracza (ekran ładowania) ----------

const RANK_TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];

// Zbiera pierwsze wystąpienia pól z poddrzewa (statystyki jednej gry mogą być zagnieżdżone).
function flatten(node, out = {}, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 4) return out;
  for (const [k, v] of Object.entries(node)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, out, depth + 1);
    else if (!(k.toLowerCase() in out)) out[k.toLowerCase()] = v;
  }
  return out;
}
const field = (flat, names) => { for (const n of names) if (flat[n] !== undefined && flat[n] !== null) return flat[n]; return undefined; };

function interpretRank(root) {
  let best = null;
  const score = (e) => (e.solo ? 2 : 0) + (e.wins != null ? 1 : 0);
  walk(root, (node, path) => {
    if (Array.isArray(node)) return;
    // Pola rangi mogą być rozbite między wpis kolejki a zagnieżdżony obiekt z tierem.
    const flat = flatten(node, {}, 2);
    const tier = typeof flat.tier === 'string' ? flat.tier.toUpperCase() : null;
    if (!tier || !RANK_TIERS.includes(tier)) return;
    const queue = String(field(flat, ['game_type', 'queue_type', 'queue', 'queuetype']) || path.join('.')).toLowerCase();
    const entry = {
      tier,
      division: field(flat, ['division', 'rank']) ?? null,
      lp: num(field(flat, ['lp', 'league_points', 'leaguepoints'])),
      wins: num(field(flat, ['win', 'wins'])),
      losses: num(field(flat, ['lose', 'loss', 'losses'])),
      solo: /solo/.test(queue),
    };
    if (!best || score(entry) > score(best)) best = entry;
  });
  return best;
}

// Statystyki championów w sezonie: wiersze z id championa i liczbą gier.
// OP.GG: summoner.most_champions.champion_stats[] = ChampionStat(id, play, win, lose, ..., champion_name).
function interpretChampionSeason(root) {
  const out = new Map();
  const most = [];
  walk(root, (node, path) => {
    if (Array.isArray(node) && /most_?champions/i.test(path.join('.'))) most.push(node);
  });
  const lists = [];
  if (most.length) lists.push(...most);
  else walk(root, (node, path) => { if (Array.isArray(node) && !/recent/i.test(path.join('.'))) lists.push(node); });
  for (const node of lists) {
    for (const row of node) {
      if (!row || typeof row !== 'object') continue;
      const flat = flatten(row);
      const id = num(field(flat, ['champion_id', 'championid'])) ?? (field(flat, ['champion_name']) !== undefined || most.length ? num(flat.id) : null);
      const games = num(field(flat, ['play', 'games', 'game_count', 'played']));
      if (id == null || games == null) continue;
      if (field(flat, ['created_at', 'game_id', 'gameid']) !== undefined) continue; // to jest pojedyncza gra
      const wins = num(field(flat, ['win', 'wins']));
      if (!out.has(id)) out.set(id, { games, wins: wins ?? null });
    }
  }
  return out;
}

const resultWin = (v) => (typeof v === 'boolean' ? v : typeof v === 'string' ? /^(win|victory|true)$/i.test(v) : num(v) === 1);

// Jedna gra z historii OP.GG: GameHistory(created_at, game_length_second, participants[], teams[]).
// participants zawiera tylko sprawdzanego gracza, KP liczymy z zabójstw jego drużyny.
function opggHistoryGame(g) {
  const p = (g.participants || []).find((x) => x && x.stats) || null;
  if (!p) return null;
  const st = p.stats;
  const championId = num(p.champion_id);
  if (championId == null || num(st.death) == null) return null;
  const team = (g.teams || []).find((t) => t && t.key === p.team_key);
  const teamKills = team && team.game_stat ? num(team.game_stat.champion_kill) : null;
  const kills = num(st.kill) || 0;
  const assists = num(st.assist) || 0;
  const seconds = num(g.game_length_second);
  const created = g.created_at ? new Date(g.created_at).getTime() : null;
  return {
    championId,
    win: st.result != null ? resultWin(st.result) : team && team.game_stat ? team.game_stat.is_win === true : null,
    kills,
    deaths: num(st.death),
    assists,
    cs: (num(st.minion_kill) || 0) + (num(st.neutral_minion_kill) || 0),
    vision: num(st.vision_score),
    wards: num(st.ward_place),
    kp: teamKills ? ((kills + assists) / teamKills) * 100 : null,
    position: String(p.position || '').toLowerCase(),
    minutes: seconds ? seconds / 60 : null,
    createdAt: Number.isNaN(created) ? null : created,
    queue: g.game_type || null,
  };
}

// Ostatnie gry gracza: jedna pozycja na grę, z jego własnymi statystykami.
function interpretGames(root) {
  const history = [];
  walk(root, (node, path) => { if (Array.isArray(node) && /game_?history|matches/i.test(String(path[path.length - 1] || ''))) history.push(node); });
  const fromHistory = history.flatMap((list) => list.map((g) => (g && typeof g === 'object' && Array.isArray(g.participants) ? opggHistoryGame(g) : null)).filter(Boolean));
  if (fromHistory.length) return fromHistory;

  let games = [];
  walk(root, (node) => {
    if (!Array.isArray(node) || games.length) return;
    const rows = node.map((row) => {
      if (!row || typeof row !== 'object') return null;
      const own = pick(row, [/^my_?data$/i, /^participant$/i, /^stats$/i]);
      const flat = flatten(own && typeof own === 'object' ? { ...row, ...own } : row);
      const championId = num(field(flat, ['champion_id', 'championid']));
      const deaths = num(field(flat, ['death', 'deaths']));
      if (championId == null || deaths == null) return null;
      const duration = num(field(flat, ['game_length_second', 'game_duration', 'duration', 'game_length']));
      const created = field(flat, ['created_at', 'game_creation', 'game_start', 'started_at']);
      return {
        championId,
        win: resultWin(field(flat, ['result', 'win', 'is_win'])),
        kills: num(field(flat, ['kill', 'kills'])) || 0,
        deaths,
        assists: num(field(flat, ['assist', 'assists'])) || 0,
        cs: (num(field(flat, ['minion_kill', 'cs', 'total_minions_killed'])) || 0) + (num(field(flat, ['neutral_minion_kill', 'neutral_minions_killed'])) || 0),
        vision: num(field(flat, ['vision_score', 'visionscore'])),
        kp: pct(field(flat, ['op_score_kill_participation', 'kill_participation', 'kp'])),
        position: String(field(flat, ['position', 'lane', 'team_position']) || '').toLowerCase(),
        minutes: duration ? (duration > 300 ? duration / 60 : duration) : null,
        createdAt: created ? new Date(typeof created === 'number' && created < 1e12 ? created * 1000 : created).getTime() : null,
      };
    }).filter(Boolean);
    if (rows.length >= Math.max(1, node.length / 2)) games = rows;
  });
  return games;
}

// Wynik wizji na minutę z sezonowych statystyk championów (historia gier OP.GG nie podaje vision score).
function interpretVision(root) {
  let score = 0;
  let seconds = 0;
  walk(root, (node) => {
    if (Array.isArray(node) || !node.basic || typeof node.basic !== 'object') return;
    const v = num(node.basic.vision_score);
    const s = num(node.game_second ?? node.game_length_second);
    if (v != null && s) { score += v; seconds += s; }
  });
  return seconds ? Math.round((score / (seconds / 60)) * 100) / 100 : null;
}

// OP.GG podaje tylko najczęściej grane championy (top 10). Champion spoza listy ma mniej gier niż ostatni na liście.
function seasonListInfo(root) {
  let info = null;
  walk(root, (node) => {
    if (info || Array.isArray(node) || !Array.isArray(node.champion_stats)) return;
    const plays = node.champion_stats.map((c) => num(c && c.play)).filter((n) => n != null);
    const total = num(node.play);
    const listed = plays.reduce((a, b) => a + b, 0);
    if (plays.length && total != null && listed < total) info = { partial: true, below: Math.min(...plays) };
  });
  return info;
}

function interpretSummoner(rawProfile, rawHistory) {
  const profile = parsePayload(rawProfile);
  const history = parsePayload(rawHistory);
  return {
    rank: interpretRank(profile) || interpretRank(history),
    seasonChampions: Object.fromEntries(interpretChampionSeason(profile)),
    seasonList: seasonListInfo(profile),
    games: interpretGames(history),
    visionPerMin: interpretVision(profile),
  };
}

// ---------- dobór narzędzi i argumentów na podstawie schematu z serwera ----------

function findTool(tools, patterns) {
  for (const re of patterns) {
    const t = tools.find((x) => re.test(x.name));
    if (t) return t;
  }
  return null;
}

const OPGG_POSITION = { top: 'top', jungle: 'jungle', middle: 'mid', bottom: 'adc', support: 'support' };

function enumMatch(values, wanted) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const w = wanted.map(norm);
  return values.find((v) => w.includes(norm(v))) || values.find((v) => w.some((x) => norm(v).includes(x)));
}

// Uzupełnia argumenty narzędzia według nazw i dozwolonych wartości z jego schematu.
function buildArgs(tool, { champion, championName, position, region, gameName, tagLine }) {
  const props = (tool.inputSchema && tool.inputSchema.properties) || {};
  const args = {};
  for (const [key, schema] of Object.entries(props)) {
    const values = schema.enum || (schema.items && schema.items.enum) || null;
    const k = key.toLowerCase();
    let v;
    if (k.includes('champion') && champion) {
      // Bez listy wartości: format z opisu pola, np. "UPPER_SNAKE_CASE" (Lee Sin -> LEE_SIN).
      const snake = /upper_?snake/i.test(schema.description || '');
      const upperSnake = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/['.]/g, '').replace(/&/g, ' ').trim().split(/\s+/).join('_').toUpperCase();
      v = values ? enumMatch(values, [champion, championName || champion]) : snake ? upperSnake(championName || champion) : champion;
    } else if (k.includes('position') || k === 'lane' || k === 'role') {
      if (position) v = values ? enumMatch(values, [OPGG_POSITION[position] || position]) : (OPGG_POSITION[position] || position);
    } else if (k.includes('game_mode') || k === 'mode' || k === 'queue') {
      v = values ? enumMatch(values, ['ranked', 'rank', 'solo']) || values[0] : 'ranked';
    } else if (k === 'lang' || k.includes('locale') || k.includes('language')) {
      v = values ? enumMatch(values, ['en_US', 'en']) || values[0] : 'en_US';
    } else if (k === 'game_name' || k === 'gamename' || k === 'summoner_name') {
      v = gameName;
    } else if (k === 'tag_line' || k === 'tagline' || k === 'tag') {
      v = tagLine;
    } else if (k === 'region') {
      const wanted = region ? [region, region.replace(/\d+$/, '')] : ['global', 'all', 'kr'];
      v = values ? enumMatch(values, wanted) || values[0] : (region || 'global');
    } else if (k === 'format') {
      v = values ? enumMatch(values, ['json']) || undefined : undefined;
    } else if (k === 'limit' || k === 'count') {
      v = schema.maximum || 20;
    } else if (k.includes('desired_output_fields') || k.includes('output_fields')) {
      v = values || undefined;
    }
    if (v !== undefined) args[key] = v;
  }
  return args;
}

// ---------- dostawca: pamięć podręczna i nakładka na dane ----------

const TTL_MS = 6 * 60 * 60 * 1000;

class OpggProvider {
  constructor({ endpoint = DEFAULT_ENDPOINT, cache = {}, saveCache = () => {}, log = () => {} } = {}) {
    this.client = new McpClient(endpoint);
    this.cache = cache;
    this.saveCache = saveCache;
    this.log = log;
    this.status = { ok: false, message: 'nie połączono', updatedAt: null };
    this.inflight = new Map();
  }

  fresh(key) {
    const e = this.cache[key];
    return e && Date.now() - e.at < TTL_MS ? e.value : null;
  }

  async cached(key, fn) {
    const hit = this.fresh(key);
    if (hit) return hit;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = (async () => {
      try {
        const value = await fn();
        if (value) {
          this.cache[key] = { at: Date.now(), value };
          this.saveCache(this.cache);
        }
        return value;
      } catch (err) {
        this.log(`OP.GG ${key}: ${err.message}`);
        // Przy błędzie użyj starszych danych z pamięci, jeśli są.
        return this.cache[key] ? this.cache[key].value : null;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  async tools() {
    // Po błędzie połączenia nie próbuj ponownie częściej niż co minutę.
    if (!this.client.tools && this.lastFailure && Date.now() - this.lastFailure < 60 * 1000) {
      throw new Error(this.status.message);
    }
    try {
      const tools = await this.client.init();
      this.status = { ok: true, message: 'OP.GG na żywo', updatedAt: Date.now() };
      return tools;
    } catch (err) {
      this.status = { ok: false, message: `OP.GG niedostępne (${err.message})`, updatedAt: Date.now() };
      this.lastFailure = Date.now();
      throw err;
    }
  }

  async meta(game) {
    return this.cached('meta', async () => {
      const tools = await this.tools();
      const tool = findTool(tools, [/lane_?meta/i, /positions?[-_]data/i, /champion[-_]?positions/i, /tier/i]);
      if (!tool) throw new Error('brak narzędzia z metą');
      const out = interpretMeta(await this.client.call(tool.name, buildArgs(tool, {})), game);
      return Object.keys(out.roles).length ? out : null;
    });
  }

  async analysis(alias, position, game) {
    const name = game.championsByAlias.get(alias)?.name || alias;
    return this.cached(`analysis:${alias}:${position || 'any'}`, async () => {
      const tools = await this.tools();
      const tool = findTool(tools, [/champion[-_]?analysis/i, /get_?champion_?analysis/i]);
      if (!tool) throw new Error('brak narzędzia z analizą championa');
      return interpretAnalysis(await this.client.call(tool.name, buildArgs(tool, { champion: alias, championName: name, position })), game);
    });
  }

  // Profil gracza na ekran ładowania: ranga, sezon na championach, ostatnie gry. Krótszy czas ważności.
  async summoner({ gameName, tagLine, region }) {
    const key = `summoner:${region}:${gameName}#${tagLine}`.toLowerCase();
    const hit = this.cache[key];
    if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.value;
    try {
      const tools = await this.tools();
      const search = findTool(tools, [/summoner[-_]?(search|profile)/i, /get_?summoner_?profile/i]);
      const history = findTool(tools, [/summoner[-_]?game[-_]?history/i, /summoner_?matches/i]);
      if (!search && !history) throw new Error('brak narzędzi z profilem gracza');
      const ctx = { gameName, tagLine, region };
      const safeCall = (tool) => (tool ? this.client.call(tool.name, buildArgs(tool, ctx)).catch((e) => { this.log(`${tool.name} ${gameName}: ${e.message}`); return null; }) : null);
      const [p, h] = await Promise.all([safeCall(search), safeCall(history)]);
      if (p == null && h == null) throw new Error('brak danych gracza');
      const value = interpretSummoner(p, h);
      this.cache[key] = { at: Date.now(), value };
      this.saveCache(this.cache);
      return value;
    } catch (err) {
      this.log(`OP.GG gracz ${gameName}#${tagLine}: ${err.message}`);
      return hit ? hit.value : null;
    }
  }

  // Surowe odpowiedzi do pliku diagnostycznego.
  async diagnostics(game, alias = 'Ahri', position = 'middle', player = null) {
    const report = { at: new Date().toISOString(), endpoint: this.client.url.href };
    try {
      const tools = await this.client.init();
      report.tools = tools;
      const meta = findTool(tools, [/lane_?meta/i, /positions?[-_]data/i, /champion[-_]?positions/i, /tier/i]);
      const analysis = findTool(tools, [/champion[-_]?analysis/i]);
      for (const [label, tool, ctx] of [['meta', meta, {}], ['analysis', analysis, { champion: alias, championName: game.championsByAlias.get(alias)?.name || alias, position }]]) {
        if (!tool) { report[label] = { error: 'nie znaleziono narzędzia' }; continue; }
        const args = buildArgs(tool, ctx);
        try {
          const raw = await this.client.call(tool.name, args);
          report[label] = {
            tool: tool.name, args,
            raw: typeof raw === 'string' ? raw.slice(0, 200000) : raw,
            parsed: label === 'meta' ? interpretMeta(raw, game) : interpretAnalysis(raw, game),
          };
        } catch (err) {
          report[label] = { tool: tool.name, args, error: err.message };
        }
      }
      if (player) {
        for (const [label, re] of [['summoner', [/summoner[-_]?(search|profile)/i]], ['history', [/summoner[-_]?game[-_]?history/i, /summoner_?matches/i]]]) {
          const tool = findTool(tools, re);
          if (!tool) { report[label] = { error: 'nie znaleziono narzędzia' }; continue; }
          const args = buildArgs(tool, player);
          try {
            const raw = await this.client.call(tool.name, args);
            report[label] = { tool: tool.name, args, raw: typeof raw === 'string' ? raw.slice(0, 200000) : raw };
          } catch (err) {
            report[label] = { tool: tool.name, args, error: err.message };
          }
        }
        report.player = player;
        try { report.playerParsed = interpretSummoner(report.summoner && report.summoner.raw, report.history && report.history.raw); } catch (err) { report.playerParsed = { error: err.message }; }
      }
    } catch (err) {
      report.error = err.message;
    }
    return report;
  }
}

// Łączy nasze dane z nakładką z OP.GG. Nasze dane zostają tam, gdzie OP.GG nic nie zwróciło.
function mergeStats(base, { meta, analyses = {} } = {}, game) {
  const data = { ...base, champions: { ...base.champions } };
  if (meta && meta.tiers && Object.values(meta.tiers).some((l) => l.length)) {
    data.meta = { source: 'OP.GG (na żywo)', tiers: meta.tiers };
  }
  if (meta && meta.roles) {
    for (const [alias, roles] of Object.entries(meta.roles)) {
      if (!roles.length) continue;
      const own = data.champions[alias];
      if (own) data.champions[alias] = { ...own, roles: [...new Set([...roles, ...own.roles])] };
      else if (game) {
        // Champion spoza naszych danych: role z OP.GG, reszta szacowana po klasie.
        const { champInfo } = require('./engine');
        const info = champInfo(alias, game, base);
        data.champions[alias] = { ...info, roles, unknown: undefined, fromStats: true };
      }
    }
  }
  for (const [alias, a] of Object.entries(analyses)) {
    if (!a || !data.champions[alias]) continue;
    const own = data.champions[alias];
    const merged = { ...own, statsBuild: true };
    // Przy sprzecznych danych wygrywają statystyki: matchup z OP.GG nadpisuje nasz wpis.
    const statCounters = a.counters || [];
    const statWeak = a.weakVs || [];
    merged.counters = [...new Set([...statCounters, ...(own.counters || []).filter((x) => !statWeak.includes(x))])];
    merged.weakVs = [...new Set([...statWeak, ...(own.weakVs || []).filter((x) => !statCounters.includes(x))])];
    if (a.items && a.items.length >= 2) merged.items = a.items;
    if (a.boots) merged.boots = a.boots;
    if (a.starters && a.starters.length) merged.starters = a.starters;
    if (a.lateItems && a.lateItems.length) merged.lateItems = a.lateItems;
    if (a.matchups && Object.keys(a.matchups).length) merged.matchupRates = a.matchups;
    if (a.spells) merged.spells = a.spells;
    if (a.skills) merged.skills = a.skills;
    if (a.runes) merged.runes = a.runes;
    if (a.synergy && a.synergy.length) merged.synergyStats = a.synergy;
    data.champions[alias] = merged;
  }
  return data;
}

module.exports = {
  interpretSummoner,
  OpggProvider, McpClient, mergeStats, interpretAnalysis, interpretMeta, parsePayload, parseRepr, buildArgs, parseRpcResponse,
};
