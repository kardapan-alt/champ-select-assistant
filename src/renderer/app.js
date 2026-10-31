const $app = document.getElementById('app');
const $status = document.getElementById('status');
const $toast = document.getElementById('toast');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Ikony z klienta mają ścieżki /lol-game-data/..., pobieramy je przez proces główny.
const asset = (p) => (p ? (p.startsWith('lcuasset:') ? p : `lcuasset://lcu${p}`) : '');
const img = (src, cls, alt = '') => (src ? `<img class="${cls}" src="${esc(asset(src))}" alt="${esc(alt)}" title="${esc(alt)}">` : `<div class="${cls}"></div>`);

let toastTimer = null;
function toast(text, error = false) {
  $toast.textContent = text;
  $toast.className = 'toast' + (error ? ' error' : '');
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, 3500);
}

const STATUS = {
  'no-client': ['Klient LoL nie jest uruchomiony', false],
  loading: ['Wczytywanie danych z klienta…', false],
  idle: ['Połączono z klientem', true],
  champselect: ['Wybór postaci', true],
  'loading-screen': ['Ekran ładowania', true],
  error: ['Błąd połączenia', false],
};

function slot(p, enemy) {
  const c = p.champion;
  const cls = ['slot', p.isMe ? 'me' : '', c && !p.locked ? 'hover' : ''].join(' ');
  const state = !c ? 'wybiera…' : p.locked ? 'zablokowany' : 'rozważa';
  const role = enemy ? '' : `<b>${esc(p.position)}</b> · `;
  return `<div class="${cls}">
    ${img(c && c.icon, 'icon', c && c.name)}
    <div class="meta">
      <div class="name">${c ? esc(c.name) : (p.isMe ? 'Ty' : '—')}</div>
      <div class="sub">${role}${p.isMe ? 'Ty · ' : ''}${state}</div>
    </div>
  </div>`;
}

// Sortowanie sugestii: według dopasowania do składu albo według maestrii (zapamiętywane lokalnie).
let sortMode = 'score';
try { sortMode = localStorage.getItem('sortMode') || 'score'; } catch { /* brak dostępu */ }
let lastState = null;

const formatPoints = (p) => (p >= 1e6 ? `${(p / 1e6).toFixed(1)}M` : p >= 1e3 ? `${Math.round(p / 1e3)}k` : String(p));
const masteryBadge = (m) => (m && m.points
  ? `<span class="mastery" title="Maestria: poziom ${m.level}, ${m.points.toLocaleString('pl-PL')} pkt">M${m.level} · ${formatPoints(m.points)}</span>`
  : '<span class="mastery none">brak maestrii</span>');
const tierBadge = (t) => (t ? `<span class="tier tier-${esc(t)}">${esc(t)}</span>` : '');

function suggestionsPanel(s) {
  if (!s.suggestions.length) {
    return `<div class="panel"><h3>Sugerowane picki</h3><div class="muted">Brak sugestii dla tej roli w danych. Możesz dopisać championów w pliku danych.</div></div>`;
  }
  const list = [...s.suggestions];
  if (sortMode === 'mastery') list.sort((x, y) => y.mastery.points - x.mastery.points || y.score - x.score);
  const mode = s.blind
    ? '<span class="mode blind">Blind pick · nie widać jeszcze przeciwnika z linii</span>'
    : `<span class="mode counter">Counter pick · przeciwnik z linii: ${esc(s.laneOpponent)}</span>`;
  const rows = list.map((g, i) => `
    <div class="sugg">
      <img src="${esc(g.icon)}" alt="">
      <div>
        <div class="top"><span class="rank">${i + 1}.</span><strong>${esc(g.name)}</strong>${tierBadge(g.tier)}<span class="score">${g.score} pkt</span>${masteryBadge(g.mastery)}</div>
        <div class="reasons">${g.reasons.length ? g.reasons.map((r) => `<span class="tag ${r.good ? 'good' : 'bad'}">${esc(r.text)}</span>`).join('') : '<span class="muted">solidny wybór na tę rolę</span>'}</div>
      </div>
      <button data-runes="${esc(g.alias)}">Importuj runy</button>
    </div>`).join('');
  return `<div class="panel">
    <div class="panel-head">
      <h3>Sugerowane picki${s.positionLabel ? ' · ' + esc(s.positionLabel) : ''}</h3>
      <div class="seg"><button data-sort="score" class="${sortMode === 'score' ? 'on' : ''}">Najlepsze</button><button data-sort="mastery" class="${sortMode === 'mastery' ? 'on' : ''}">Maestria</button></div>
    </div>
    <div class="modeline">${mode}${s.metaSource ? `<span class="muted">meta: ${esc(s.metaSource)}</span>` : ''}</div>
    <div class="suggestions">${rows}</div>
  </div>`;
}

function bansPanel(s) {
  if (!s.banPhase || !s.bans.length) return '';
  const rows = s.bans.map((b) => `
    <div class="ban">
      <img src="${esc(b.icon)}" alt="">
      <div>
        <div class="top"><strong>${esc(b.name)}</strong>${tierBadge(b.tier)}</div>
        <div class="reasons">${b.reasons.map((r) => `<span class="tag">${esc(r)}</span>`).join('')}</div>
      </div>
    </div>`).join('');
  return `<div class="panel${s.myBanTurn ? ' highlight' : ''}"><h3>Sugerowane bany${s.myBanTurn ? ' · Twoja kolej' : ''}</h3><div class="bans">${rows}</div></div>`;
}

function compPanel(c) {
  if (!c || (!c.ally && !c.enemy)) return '';
  const side = (label, a, cls) => `<div class="comp ${cls}"><div class="muted">${label}</div>${a
    ? `<div class="comp-labels">${a.labels.map((l) => `<span class="tag">${esc(l)}</span>`).join('')}</div>`
    : '<div class="muted">brak wyraźnego stylu</div>'}</div>`;
  const hint = c.enemy ? `<div class="note">Wskazówka: ${esc(c.enemy.hint)}.</div>` : '';
  return `<div class="panel"><h3>Archetypy składów</h3><div class="comps">${side('Wasz styl', c.ally, 'ally')}${side('Styl wroga', c.enemy, 'enemy')}</div>${hint}</div>`;
}

function myChampionPanel(m, readonly = false, auto = null) {
  const r = m.runes;
  // W trakcie wyboru runy są wstępne: dopasowanie do wroga jest pełne dopiero, gdy wszyscy zablokują.
  const status = readonly ? ''
    : m.provisional
      ? `<div class="note">Wstępne runy: zmienią się, gdy przeciwnicy wybiorą championów.${auto && auto.enabled ? ' Zaimportują się same po zablokowaniu wszystkich.' : ''}</div>`
      : auto && auto.done ? `<div class="note good">Runy zaimportowane automatycznie: ${esc(auto.done)}</div>`
        : auto && auto.error ? `<div class="note bad">Automatyczny import run nie udał się: ${esc(auto.error)}</div>` : '';
  return `<div class="panel">
    <h3>Twój champion${m.provisional && !readonly ? ' · runy wstępne' : ''}</h3>
    ${status}
    <div class="mychamp">
      <img src="${esc(m.icon)}" alt="">
      <div>
        <div class="name">${esc(m.name)}</div>
        <div class="muted">${m.locked ? 'Zablokowany' : 'Rozważasz'} · runy: ${esc(r.primaryStyle)} + ${esc(r.subStyle)}</div>
      </div>
    </div>
    <div class="runes">
      ${img(r.keystone.icon, 'rune key', r.keystone.name)}
      ${r.perks.slice(0, 3).map((p) => img(p.icon, 'rune', p.name)).join('')}
      <div class="sep"></div>
      ${r.perks.slice(3).map((p) => img(p.icon, 'rune', p.name)).join('')}
    </div>
    <div class="rune-names"><b>${esc(r.keystone.name)}</b> · ${r.perks.slice(0, 3).map((p) => esc(p.name)).join(', ')} <span class="muted">| ${r.perks.slice(3).map((p) => esc(p.name)).join(', ')}</span></div>
    <div class="rune-names muted">Odłamki: ${r.shards.map((x) => esc(x.name)).join(', ')}</div>
    ${r.adaptations.length ? `<div class="adapt"><h4>Dopasowane ${r.laneOpponent ? `pod ${esc(r.laneOpponent)} i skład wroga` : 'pod skład wroga'}</h4>${r.adaptations.map((a) => `<div>• ${esc(a)}</div>`).join('')}</div>` : ''}
    <div class="spells-line">${r.spells.map((x) => img(x.icon, 'spell', x.name)).join('')}<span>${r.spells.map((x) => esc(x.name)).join(' + ')}${r.spellsWhy ? ` <span class="muted">· ${esc(r.spellsWhy)}</span>` : ''}</span></div>
    ${readonly ? '' : `<div class="actions">
      <button class="primary" data-runes="${esc(m.alias)}">Importuj runy</button>
      <button data-spells="${esc(m.alias)}">Ustaw czary przywoływacza</button>
    </div>`}
  </div>`;
}

const itemTile = (it, extra = '') => `<div class="item">${img(it.icon, '', it.name)}${esc(it.name)}${extra}</div>`;

function enemyBar(e) {
  if (!e || !e.count) return '';
  return `<div class="dmgbar">
    <div class="dmgbar-track"><div class="ap" style="width:${e.apPercent}%"></div><div class="ad" style="width:${e.adPercent}%"></div></div>
    <div class="dmgbar-legend"><span class="ap-t">AP ${e.apPercent}%</span><span class="ad-t">AD ${e.adPercent}%</span></div>
    ${e.threats.length ? `<div class="reasons">${e.threats.map((t) => `<span class="tag bad">${esc(t)}</span>`).join('')}</div>` : ''}
  </div>`;
}

const whyTile = (i) => itemTile(i, `<div class="why">${esc(i.why)}</div>`);

function buildPanel(b, readonly = false) {
  return `<div class="panel">
    <h3>Build · ${esc(b.name)}${b.estimated ? ' (szacunkowy, champion spoza danych)' : ''}${b.provisional ? ' · wstępny' : ''}</h3>
    ${b.provisional ? '<div class="note" style="margin:-4px 0 10px">Wstępny build: zmieni się, gdy przeciwnicy wybiorą championów. Do sklepu wyślij go po zablokowaniu wszystkich.</div>' : ''}
    <div class="muted" style="margin:-4px 0 10px">${b.fromStats ? 'Baza: najpopularniejszy build z OP.GG, sloty sytuacyjne dobrane pod skład wroga.' : 'Baza: wbudowane dane, sloty sytuacyjne dobrane pod skład wroga.'}</div>
    <div class="build-row"><h4>Skład wroga</h4>${enemyBar(b.enemy)}</div>
    <div class="build-row"><h4>Pełny build pod ten skład</h4><div class="items">${[b.boots, ...b.items].map(whyTile).join('')}</div></div>
    ${b.notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}
    ${b.alternatives.length ? `<div class="build-row" style="margin-top:14px"><h4>Alternatywy</h4><div class="items">${b.alternatives.map(whyTile).join('')}</div></div>` : ''}
    <div class="build-row"><h4>Czary</h4><div class="items">${b.spells.map((s) => itemTile(s)).join('')}</div>${b.spellsWhy ? `<div class="note">${esc(b.spellsWhy)}</div>` : ''}</div>
    <div class="build-row"><h4>Kolejność umiejętności</h4><div class="skills">${esc(b.skills)}</div></div>
    ${readonly ? '' : `<div class="actions" style="margin-top:12px">
      <button class="primary" data-itemset="${esc(b.alias)}">Wyślij build do sklepu w grze</button>
      <span class="muted small">Zestaw „CS Assist” pojawi się w sklepie w zakładce z zestawami przedmiotów.</span>
    </div>`}
  </div>`;
}

// ---------- ekran ładowania ----------

const gier = (n) => (n === 1 ? 'gra' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'gry' : 'gier');
const pctClass = (v) => (v == null ? '' : v >= 55 ? 'good' : v < 48 ? 'bad' : '');

// Blok statystyki: duży procent wygranych (kolor zależny od wyniku), nazwa, liczba gier i pasek.
function stat(value, title, caption) {
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  return `<div class="stat">
    <div class="stat-v ${pctClass(v)}">${v == null ? '–' : `${v}%`}</div>
    <div class="stat-t">${title}</div>
    <div class="stat-c">${caption}</div>
    <div class="stat-bar"><i class="${pctClass(v)}" style="width:${v ?? 0}%"></i></div>
  </div>`;
}

// Rozwinięte listy championów (pamiętane między odświeżeniami widoku).
const expanded = new Map();
// Zakładka na ekranie ładowania i w trakcie gry: gracze albo build z champion selecta.
let loadingTab = 'players';
const champIcon = (id) => `lcuasset://lcu/lol-game-data/assets/v1/champion-icons/${id}.png`;

function champTable(list, withKda) {
  if (!list || !list.length) return '<div class="muted pool-empty">Brak gier</div>';
  return `<div class="pool">${list.map((c) => `
    <div class="pool-row">
      ${img(champIcon(c.championId), 'pool-icon', c.name)}
      <span class="pool-name">${esc(c.name)}</span>
      <span class="pool-games">${c.games} ${gier(c.games)}</span>
      <span class="pool-wr ${pctClass(c.winRate)}">${c.winRate != null ? `${c.winRate}%` : '–'}</span>
      ${withKda ? `<span class="pool-kda">${esc(c.kda)}</span>` : ''}
    </div>`).join('')}</div>`;
}

function poolSection(p) {
  const key = p.name;
  const open = expanded.get(key);
  const tabs = `<div class="pool-tabs">
    <button data-pool="${esc(key)}" data-view="season" class="${open === 'season' ? 'on' : ''}">Sezon ▾</button>
    <button data-pool="${esc(key)}" data-view="30" class="${open === '30' ? 'on' : ''}">30 dni ▾</button>
  </div>`;
  const body = open === 'season' ? champTable(p.seasonChamps, false) : open === '30' ? champTable(p.recent30Champs, true) : '';
  return `<div class="pool-box">${tabs}${body}</div>`;
}

function playerCardHtml(p, side) {
  const c = p.champion || {};
  const r = p.rank;
  const rec = p.recent || {};
  const games = (n) => `${n ?? 0} ${gier(n ?? 0)}`;
  const rankLine = r
    ? `<span class="rank-badge tier-${esc(r.tier.toLowerCase())}">${esc(r.label)}</span>${r.lp != null ? `<span class="lp">${r.lp} LP</span>` : ''}`
    : '<span class="rank-badge">Bez rangi</span>';
  const tags = [...p.tags].sort((x, y) => (x.kind === 'warn' ? -1 : 0) - (y.kind === 'warn' ? -1 : 0)).slice(0, 3);
  const body = p.pending
    ? '<div class="muted pc-wait">Pobieram statystyki…</div>'
    : !p.loaded
      ? '<div class="muted pc-wait">Brak danych gracza</div>'
      : `<div class="stats">
          ${stat(r ? r.winRate : null, 'Sezon', r && r.games ? games(r.games) : 'brak gier')}
          ${stat(c.seasonWinRate, 'Champion', c.seasonBelow ? `&lt; ${c.seasonBelow} ${gier(c.seasonBelow)}` : games(c.seasonGames))}
          ${stat(rec.last30WinRate, '30 dni', rec.last30More ? `${rec.last30Days}+ ${gier(rec.last30Days)}` : games(rec.last30Days))}
        </div>
        ${c.kda ? `<div class="pc-kda">KDA championem <b>${c.kda.k} / <span class="bad">${c.kda.d}</span> / ${c.kda.a}</b></div>` : ''}
        ${tags.length ? `<div class="pc-tags">${tags.map((t) => `<span class="tag ${t.kind === 'good' ? 'good' : t.kind === 'warn' ? 'bad' : ''}">${esc(t.text)}</span>`).join('')}</div>` : ''}
        ${poolSection(p)}`;
  return `<div class="pcard ${side}${p.isMe ? ' me' : ''}${p.laneOpponent ? ' lane-opp' : ''}">
    ${p.laneOpponent ? '<div class="lane-badge">Twój przeciwnik z linii</div>' : ''}
    <div class="pc-head">
      ${img(p.championView && p.championView.icon, 'icon', p.championView && p.championView.name)}
      <div class="meta">
        <div class="name" title="${esc(p.name)}">${esc(p.name)}</div>
        <div class="sub">${rankLine}</div>
      </div>
    </div>
    ${body}
  </div>`;
}

const VERDICT_LABEL = { good: ['Korzystny', 'good'], bad: ['Trudny', 'bad'], even: ['Wyrównany', ''] };

function planPanel(plan) {
  if (!plan) return '';
  const [label, cls] = VERDICT_LABEL[plan.verdict] || ['', ''];
  const wr = plan.winRate != null ? `<span class="${pctClass(plan.winRate)}">${plan.winRate}% wygranych wg OP.GG</span>` : '';
  return `<div class="panel plan">
    <div class="plan-head">
      ${img(plan.me.icon, 'icon', plan.me.name)}<span class="vs">vs</span>${img(plan.opponent.icon, 'icon', plan.opponent.name)}
      <div class="meta">
        <h2>Plan na linię: ${esc(plan.me.name)} vs ${esc(plan.opponent.name)}</h2>
        <div class="sub">${label ? `<span class="tag ${cls}">${label} matchup</span>` : ''} ${wr} <span class="muted">· obrażenia ${esc(plan.damage)}${plan.opponent.player ? ` · ${esc(plan.opponent.player)}` : ''}</span></div>
      </div>
    </div>
    <ul class="plan-tips">${plan.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    ${plan.firstBack ? `<div class="plan-back">${img(plan.firstBack.icon, 'spell', plan.firstBack.name)}<span>Pierwszy powrót, gdy przegrywasz wymiany: <b>${esc(plan.firstBack.name)}</b></span></div>` : ''}
  </div>`;
}

function gamePlanPanel(g) {
  if (!g) return '';
  const styles = (list) => (list.length ? list.map((l) => `<span class="tag">${esc(l)}</span>`).join('') : '<span class="muted">brak wyraźnego stylu</span>');
  const people = (title, list, cls) => (list.length
    ? `<div class="gp-people"><span class="gp-label ${cls}">${title}</span>${list.map((x) => `<span><b>${esc(x.who)}</b> <span class="muted">· ${esc(x.why)}</span></span>`).join('')}</div>`
    : '');
  return `<div class="panel plan game-plan">
    <h2>Plan na grę</h2>
    <div class="gp-styles"><span class="ally-c">Wy</span>${styles(g.ourStyle)}<span class="enemy-c">Wróg</span>${styles(g.theirStyle)}</div>
    ${g.phases.map((ph) => `<div class="gp-phase"><h4>${esc(ph.title)}</h4><ul class="plan-tips">${ph.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}
    ${people('Uważajcie na', g.threats, 'bad')}
    ${people('Słaby punkt wroga', g.targets, 'good')}
  </div>`;
}

function loadingScreen(s) {
  const tab = s.final ? loadingTab : 'players';
  const tabs = s.final ? `<div class="seg loading-tabs">
      <button data-loading-tab="players" class="${tab === 'players' ? 'on' : ''}">Plan i gracze</button>
      <button data-loading-tab="build" class="${tab === 'build' ? 'on' : ''}">Build i runy</button>
    </div>` : '';
  const body = tab === 'build'
    ? `<div class="final">${s.final.myChampion ? myChampionPanel(s.final.myChampion, true) : ''}${s.final.build ? buildPanel(s.final.build, true) : ''}</div>`
    : `${s.plan || s.gamePlan ? `<div class="plans">${planPanel(s.plan)}${gamePlanPanel(s.gamePlan)}</div>` : ''}
    <h3 class="ally-h">Twoja drużyna</h3>
    <div class="pgrid">${s.allies.map((p) => playerCardHtml(p, 'ally')).join('')}</div>
    <h3 class="enemy-h">Przeciwnicy</h3>
    <div class="pgrid">${s.enemies.map((p) => playerCardHtml(p, 'enemy')).join('')}</div>`;
  return `<div class="loading-screen">
    ${tabs}
    ${body}
    <footer><span class="stats-status ${s.statsStatus && s.statsStatus.ok ? 'ok' : ''}">${esc(s.statsStatus ? s.statsStatus.message : '')}${s.region ? ` · serwer ${esc(s.region)}` : ''}</span><button data-stats-diag>Diagnostyka OP.GG</button></footer>
  </div>`;
}

function render(s) {
  if (!s) return;
  lastState = s;
  const [label, live] = STATUS[s.status] || ['', false];
  $status.textContent = s.status === 'error' ? `${label}: ${s.message}` : label;
  $status.className = 'status' + (live ? ' live' : '');

  if (s.status === 'loading-screen') {
    $app.innerHTML = loadingScreen(s);
    return;
  }
  if (s.status !== 'champselect') {
    const msg = {
      'no-client': ['Uruchom klienta League of Legends', 'Aplikacja połączy się automatycznie, gdy klient będzie włączony.'],
      loading: ['Łączenie…', 'Pobieranie danych gry z klienta.'],
      idle: ['Czekam na wybór postaci', 'Wejdź do kolejki. Gdy zacznie się champion select, zobaczysz tu składy i sugestie.'],
      error: ['Coś poszło nie tak', 'Spróbuję połączyć się ponownie za chwilę.'],
    }[s.status] || ['', ''];
    const diag = s.status === 'idle' ? '<div class="actions" style="justify-content:center;margin-top:18px"><button data-stats-diag>Diagnostyka OP.GG</button></div>' : '';
    $app.innerHTML = `<div class="empty"><h2>${esc(msg[0])}</h2><div>${esc(msg[1])}</div>${diag}</div>`;
    return;
  }

  const meLocked = s.myChampion && s.myChampion.locked;
  const center = [
    bansPanel(s),
    !meLocked ? suggestionsPanel(s) : '',
    compPanel(s.compositions),
    s.myChampion ? myChampionPanel(s.myChampion, false, s.autoRunes) : '',
    s.build ? buildPanel(s.build) : '',
  ].join('');

  $app.innerHTML = `<div class="layout">
    <section class="team ally"><h3>Twoja drużyna</h3>${s.allies.map((p) => slot(p, false)).join('')}</section>
    <section class="center">${center}
      <footer>
        <span class="stats-status ${s.statsStatus && s.statsStatus.ok ? 'ok' : ''}">${esc(s.statsStatus ? s.statsStatus.message : '')}</span>
        <button data-toggle-stats>${s.statsEnabled ? 'Wyłącz OP.GG' : 'Włącz OP.GG'}</button>
        <button data-toggle-auto-runes>${s.autoRunes && s.autoRunes.enabled ? 'Auto-import run: wł.' : 'Auto-import run: wył.'}</button>
        <button data-stats-diag>Diagnostyka OP.GG</button>
        <button data-open-data>Edytuj dane</button><button data-reload-data>Wczytaj dane ponownie</button>
      </footer>
    </section>
    <section class="team enemy"><h3>Przeciwnicy</h3>${s.enemies.map((p) => slot(p, true)).join('')}${enemyBar(s.enemyProfile)}</section>
  </div>`;
}

$app.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.pool) {
    const key = btn.dataset.pool;
    expanded.set(key, expanded.get(key) === btn.dataset.view ? null : btn.dataset.view);
    render(lastState);
    return;
  }
  if (btn.dataset.loadingTab) {
    loadingTab = btn.dataset.loadingTab;
    render(lastState);
    return;
  }
  if (btn.dataset.sort) {
    sortMode = btn.dataset.sort;
    try { localStorage.setItem('sortMode', sortMode); } catch { /* brak dostępu */ }
    render(lastState);
    return;
  }
  btn.disabled = true;
  try {
    if (btn.dataset.runes) {
      const res = await window.assist.importRunes(btn.dataset.runes);
      res.ok ? toast(`Zaimportowano runy: ${res.name}`) : toast(res.error, true);
    } else if (btn.dataset.itemset) {
      const res = await window.assist.exportItemSet(btn.dataset.itemset);
      res.ok ? toast(`Wysłano do sklepu: ${res.name}`) : toast(res.error, true);
    } else if (btn.dataset.spells) {
      const res = await window.assist.setSpells(btn.dataset.spells);
      res.ok ? toast('Ustawiono czary przywoływacza') : toast(res.error, true);
    } else if ('toggleStats' in btn.dataset) {
      const res = await window.assist.toggleStats();
      res.ok ? toast(res.enabled ? 'Statystyki OP.GG włączone' : 'Statystyki OP.GG wyłączone, używam własnych danych') : toast(res.error, true);
    } else if ('toggleAutoRunes' in btn.dataset) {
      const res = await window.assist.toggleAutoRunes();
      res.ok ? toast(res.enabled ? 'Runy będą importowane same po zablokowaniu wszystkich' : 'Automatyczny import run wyłączony') : toast(res.error, true);
    } else if ('statsDiag' in btn.dataset) {
      toast('Zbieram odpowiedzi z OP.GG…');
      const res = await window.assist.statsDiagnostics();
      res.ok ? toast(`Zapisano plik diagnostyczny: ${res.file}`) : toast(`OP.GG: ${res.error || 'błąd'} (plik: ${res.file || '-'})`, true);
    } else if ('openData' in btn.dataset) {
      await window.assist.openDataFile();
    } else if ('reloadData' in btn.dataset) {
      const res = await window.assist.reloadData();
      res.ok ? toast('Wczytano dane ponownie') : toast(res.error, true);
    }
  } finally {
    btn.disabled = false;
  }
});

// Pasek z informacją o nowej wersji aplikacji.
const $update = document.getElementById('update');
function renderUpdate(u) {
  if (!u) return;
  const ready = u.state === 'ready';
  if (u.state === 'downloading') $update.textContent = `Pobieram wersję ${u.version}… ${u.percent || 0}%`;
  else $update.innerHTML = `${ready ? `Wersja ${esc(u.version)} pobrana` : `Dostępna wersja ${esc(u.version)}`} <button>${ready ? 'Uruchom ponownie' : 'Pobierz'}</button>`;
  $update.hidden = false;
}
window.assist.appVersion().then((v) => { document.getElementById('version').textContent = `v${v}`; });
$update.addEventListener('click', (e) => { if (e.target.closest('button')) window.assist.updateAction(); });
window.assist.onUpdate(renderUpdate);
window.assist.getUpdate().then(renderUpdate);

window.assist.onState(render);
window.assist.getState().then(render);
