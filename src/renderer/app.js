const $app = document.getElementById('app');
const $status = document.getElementById('status');
const $toast = document.getElementById('toast');
const isAramView = mode => mode === 'aram' || mode === 'mayhem';

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
  const role = enemy || !p.position ? '' : `<b>${esc(p.position)}</b> · `;
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
  const list = [...(sortMode === 'mastery' ? (s.masterySuggestions || s.suggestions) : s.suggestions)];
  if (sortMode === 'mastery') list.sort((x, y) => y.mastery.points - x.mastery.points || y.score - x.score);
  const mode = s.blind
    ? '<span class="mode blind">Blind pick · nie widać jeszcze przeciwnika z linii</span>'
    : `<span class="mode counter">Counter pick · przeciwnik z linii: ${esc(s.laneOpponent)}</span>`;
  const rows = list.map((g, i) => `
    <div class="sugg">
      <img src="${esc(g.icon)}" alt="">
      <div>
        <div class="top"><span class="rank">${i + 1}.</span><strong>${esc(g.name)}</strong>${tierBadge(g.tier)}<span class="score" title="Względne dopasowanie do draftu; to nie procent szans na wygraną.">${g.score} pkt dopasowania</span>${masteryBadge(g.mastery)}</div>
        <div class="reasons">${g.reasons.length ? g.reasons.map((r) => `<span class="tag ${r.good ? 'good' : 'bad'}">${esc(r.text)}</span>`).join('') : '<span class="muted">solidny wybór na tę rolę</span>'}</div>
        ${g.dataNote ? `<div class="data-note">${esc(g.dataNote)}</div>` : ''}
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

// ARAM: kto z ławki (albo obecny champion) najlepiej pasuje do składu.
function aramPanel(s) {
  const list = s.aramChoices || [];
  if (!list.length) return '';
  const best = list[0];
  const mine = list.find((c) => c.current);
  // Zamianę polecamy tylko przy wyraźnej różnicy; przy kilku punktach to kwestia gustu.
  const head = best.current
    ? '<span class="mode counter">Twój champion pasuje najlepiej. Zostań przy nim.</span>'
    : mine && best.score - mine.score >= 5
      ? `<span class="mode blind">Warto wziąć z ławki: ${esc(best.name)} (+${best.score - mine.score} pkt)</span>`
      : '<span class="mode counter">Twój champion jest w porządku, różnice z ławką są małe.</span>';
  const rows = list.map((g, i) => `
    <div class="sugg${g.current ? ' current' : ''}">
      <img src="${esc(g.icon)}" alt="">
      <div>
        <div class="top"><span class="rank">${i + 1}.</span><strong>${esc(g.name)}</strong>${g.current ? '<span class="tag good">Twój</span>' : '<span class="tag">ławka</span>'}${tierBadge(g.tier)}<span class="score">${g.score} pkt</span>${masteryBadge(g.mastery)}</div>
        <div class="reasons">${g.reasons.length ? g.reasons.map((r) => `<span class="tag ${r.good ? 'good' : 'bad'}">${esc(r.text)}</span>`).join('') : '<span class="muted">pasuje do składu</span>'}</div>
      </div>
    </div>`).join('');
  return `<div class="panel"><h3>ARAM · ławka</h3><div class="modeline">${head}</div><div class="suggestions">${rows}</div></div>`;
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
  if (r?.disabled) return `<div class="panel"><h3>${esc(m.name)} · Mayhem</h3><p class="muted">${esc(r.reason)}</p><div class="spells-line">${r.spells.map(s=>img(s.icon,'spell',s.name)).join('')}<span>${r.spells.map(s=>esc(s.name)).join(' + ')}</span></div>${readonly ? '' : `<button data-spells="${esc(m.alias)}">Ustaw czary przywoływacza</button>`}</div>`;
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
    <div class="actions rune-choice-actions"><button data-choice="${r.pinned ? 'unpin-runes' : 'runes'}">${r.pinned ? 'Odblokuj runy' : 'Przypnij te runy'}</button>${!labActive ? '<button data-choice="client-runes">Zachowaj moje runy z klienta</button>' : ''}</div>
    ${readonly ? '' : `<div class="actions">
      <button class="primary" data-runes="${esc(m.alias)}">Importuj runy</button>
      <button data-spells="${esc(m.alias)}">Ustaw czary przywoływacza</button>
    </div>`}
  </div>`;
}

const itemTile = (it, extra = '', cls = '') => `<div class="item ${cls}">${it.step ? `<span class="step">${it.step}</span>` : ''}${img(it.icon, '', it.name)}<div class="item-name">${esc(it.name)}</div>${extra}</div>`;

function enemyBar(e) {
  if (!e || !e.count) return '';
  return `<div class="dmgbar">
    <div class="dmgbar-track"><div class="ap" style="width:${e.apPercent}%"></div><div class="ad" style="width:${e.adPercent}%"></div></div>
    <div class="dmgbar-legend"><span class="ap-t">AP ${e.apPercent}%</span><span class="ad-t">AD ${e.adPercent}%</span></div>
    ${e.threats.length ? `<div class="reasons">${e.threats.map((t) => `<span class="tag bad">${esc(t)}</span>`).join('')}</div>` : ''}
  </div>`;
}

const whyTile = (i) => itemTile(i, `${i.pinControl ? `<button class="item-pin ${i.pinned ? 'on' : ''}" data-pin-item="${i.id}" data-slot="${i.slot}" aria-label="${i.pinned ? 'Odepnij' : 'Przypnij'} ${esc(i.name)}" title="${i.pinned ? 'Odepnij' : 'Przypnij'} ${esc(i.name)}">${i.pinned ? '●' : '○'}</button>` : ''}${i.priority ? '<span class="priority-label">Wcześniej</span>' : ''}<div class="why">${esc(i.why)}</div>`, i.situational ? 'situ' : '');
// Kolejność buildu: numer na rogu ikony (buty jako drugi item, jak w zestawie do sklepu).
const buildTiles = (b) => {
  const [first, ...rest] = b.items;
  const outside = b.inventory?.bootsSlot === 'quest';
  const ordered = outside || b.inventory?.bootsSlot === 'none' ? b.items : [first, b.boots, ...rest].filter(Boolean);
  const main = ordered.map((it, i) => whyTile({ ...it, pinControl: !it.owned, slot: it.id === b.boots.id ? 'boots' : it.slot ?? b.items.findIndex(x => x.id === it.id), step: outside && i > 0 ? i + 2 : i + 1 })).join('');
  const reserved = b.reservedSlot ? `<div class="item reserved-item"><div class="reserved-icon">◈</div><div class="item-name">${esc(b.reservedSlot)}</div><div class="why">Zostaje w ekwipunku</div></div>` : '';
  const side = b.quest?.slotItem;
  return `<div class="build-inventory ${side ? 'with-quest-slot' : ''}"><div class="items path inventory-items">${main}${reserved}</div>
    ${side ? `<aside class="quest-slot"><div class="quest-slot-label">Slot questa</div>${whyTile({ ...side, pinControl: outside, slot: 'boots', pinned: b.boots.pinned })}</aside>` : ''}</div>`;
};
// "Q > W > E" jako klawisze.
const skillKeys = (order) => String(order || '').split('>').map((k) => k.trim()).filter(Boolean)
  .map((k) => `<span class="key key-${esc(k.toLowerCase())}">${esc(k)}</span>`).join('<span class="key-sep">›</span>');

// Konkretne zagrożenia w składzie wroga i odpowiedź na nie (np. Yasuo + Jhin → Randuin's Omen).
function situationsPanel(list, title = 'Na co uważać w składzie wroga') {
  if (!list || !list.length) return '';
  const rows = list.map((x) => {
    const it = x.item;
    const answer = !it ? ''
      : `<div class="sit-item">${img(it.icon, 'sit-icon', it.name)}<div><b>${esc(it.name)}</b>${it.mine
        ? `<span class="tag ${it.inBuild ? 'good' : ''}">${it.inBuild ? 'w Twoim buildzie' : 'alternatywa dla Ciebie'}</span>`
        : `<span class="muted">kupuje: ${esc(it.owner)}</span>`}</div></div>`;
    return `<div class="sit${x.level === 2 ? ' strong' : ''}">
      <div class="sit-champs">${x.champions.map((c) => img(c.icon, 'sit-champ', c.name)).join('')}</div>
      <div class="sit-body"><div class="sit-text">${esc(x.text)}</div><div class="sit-answer">${esc(x.answer)}</div></div>
      ${answer}
    </div>`;
  }).join('');
  return `<div class="panel situations"><h3>${esc(title)}</h3><div class="sit-list">${rows}</div></div>`;
}

// Stan zestawu w sklepie: wysłany automatycznie, błąd albo informacja, kiedy się wyśle.
// Za dużo zestawów w kliencie: grupy, które gracz może usunąć jednym kliknięciem (z ręcznego albo automatycznego wysłania).
let itemSetProblem = null;
function itemSetCleanup(b, auto) {
  const groups = (itemSetProblem && itemSetProblem.groups) || (auto && auto.groups);
  if (!groups || !groups.length) return '';
  return `<div class="adapt" style="margin-top:10px">
    <h4>Za dużo zestawów przedmiotów w kliencie</h4>
    <div>Klient ma limit miejsca na wszystkie zestawy razem. Usuń jedną z grup (najczęściej zestawy z innych aplikacji), a build wyśle się od razu:</div>
    <div class="actions" style="margin-top:6px">${groups.map((g) => `<button data-clean-sets="${esc(g.name)}" data-alias="${esc(b.alias)}">Usuń „${esc(g.name)}” (${g.count}, ${g.kb} KB)</button>`).join('')}</div>
  </div>`;
}

function itemSetStatus(b, auto) {
  if (!auto || !auto.enabled) return '<span class="muted small">Zestaw „CS Assist” pojawi się w sklepie w zakładce z zestawami przedmiotów.</span>';
  if (auto.done) return `<span class="small good">✓ W sklepie: ${esc(auto.done)}</span>`;
  if (auto.error) return `<span class="small bad">Automatyczne wysłanie nie udało się: ${esc(auto.error)}</span>`;
  return `<span class="muted small">${b.provisional ? 'Wyśle się sam do sklepu, gdy wszyscy zablokują.' : 'Wysyłam do sklepu…'}</span>`;
}

function buildPanel(b, readonly = false, auto = null) {
  const aram = isAramView(b.mode);
  return `<div class="panel build-panel">
    <h3>Build · ${esc(b.name)}${b.estimated ? ' (szacunkowy, champion spoza danych)' : ''}${b.provisional ? ' · wstępny' : ''}</h3>
    ${mayhemPanel(b)}
    ${b.provisional ? '<div class="note" style="margin:-4px 0 10px">Wstępny build: zmieni się, gdy przeciwnicy wybiorą championów. Do sklepu wyślij go po zablokowaniu wszystkich.</div>' : ''}
    ${aram && !b.enemy.count && !readonly ? '<div class="note" style="margin:-4px 0 10px">ARAM: w wyborze postaci nie widać przeciwników, więc build jest pod Twojego championa. Na ekranie ładowania dopasuje się do składu wroga i wyśle do sklepu jeszcze raz.</div>' : ''}
    <div class="muted build-context" style="margin:-4px 0 10px">${b.fromStats ? 'Baza: OP.GG.' : 'Baza: wbudowane dane.'} ${esc(b.quest?.summary || 'Sloty sytuacyjne dobrane pod skład wroga.')}</div>
    <div class="build-row build-primary"><h4>Kolejność zakupów${b.quest ? ' · plan po queście' : ''}</h4>${buildTiles(b)}</div>
    <div class="build-essentials"><div><span class="muted">Umiejętności</span><div class="skills">${skillKeys(b.skills)}</div></div><div><span class="muted">Czary</span><div class="spells-line">${b.spells.map((s) => img(s.icon, 'spell', s.name)).join('')}<span>${b.spells.map((s) => esc(s.name)).join(' + ')}</span></div></div></div>
    ${disclosure('build-details', 'Dlaczego te zakupy? · własne wybory', `${buildExplanation(b)}${b.enemy && b.enemy.count ? `<div class="build-row"><h4>Szacowany profil obrażeń wroga</h4>${enemyBar(b.enemy)}</div>` : ''}${b.notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}${b.alternatives.length ? `<div class="build-row"><h4>Alternatywy</h4><div class="items">${b.alternatives.map(whyTile).join('')}</div></div>` : ''}${b.spellsWhy ? `<div class="note">${esc(b.spellsWhy)}</div>` : ''}`)}
    ${readonly && !labActive && b.mode !== 'mayhem' ? '<div class="shop-hint">W sklepie szukaj zestawu <b>CS Assist</b> · Zestawy przedmiotów</div>' : ''}
    ${readonly && !labActive && b.mode === 'mayhem' ? `<div class="actions"><button data-itemset="${esc(b.alias)}">Zapisz zestaw w kliencie LoL</button><span class="note">Kolejne zakupy sprawdzaj tutaj pod Ctrl+X.</span></div>` : ''}
    ${readonly ? '' : `<div class="actions" style="margin-top:12px;align-items:center">
      <button class="primary" data-itemset="${esc(b.alias)}">${auto && auto.done ? 'Wyślij ponownie' : 'Wyślij build do sklepu w grze'}</button>
      ${itemSetStatus(b, auto)}
    </div>${itemSetCleanup(b, auto)}`}
  </div>`;
}

// ---------- ekran ładowania ----------

const gier = (n) => (n === 1 ? 'gra' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'gry' : 'gier');
const pctClass = (v) => (v == null ? '' : v >= 55 ? 'good' : v < 48 ? 'bad' : '');

// Blok statystyki: duży procent wygranych (kolor zależny od wyniku), nazwa, liczba gier i pasek.
function stat(value, title, caption, sample = 0) {
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  const small = v != null && sample < 20;
  const cls = small ? '' : pctClass(v);
  return `<div class="stat">
    <div class="stat-v ${cls}">${v == null ? '–' : `${v}%`}</div>
    <div class="stat-t">${title}</div>
    <div class="stat-c">${caption}${small ? '<span class="sample-note">mała próba</span>' : ''}</div>
    <div class="stat-bar"><i class="${cls}" style="width:${v ?? 0}%"></i></div>
  </div>`;
}

// Rozwinięte listy championów (pamiętane między odświeżeniami widoku).
const expanded = new Map();
// Zakładka na ekranie ładowania i w trakcie gry: gracze albo build z champion selecta.
let loadingTab = 'overview';
function disclosure(key, label, html) {
  return `<details class="disclosure" data-detail="${esc(key)}"${expanded.get(`detail:${key}`) ? ' open' : ''}><summary>${esc(label)}</summary><div class="disclosure-body">${html}</div></details>`;
}
const champIcon = (id) => `lcuasset://lcu/lol-game-data/assets/v1/champion-tiles/${id}/${id * 1000}.jpg`;

function champTable(list, withKda) {
  if (!list || !list.length) return '<div class="muted pool-empty">Brak gier</div>';
  return `<div class="pool">${list.map((c) => `
    <div class="pool-row">
      ${img(champIcon(c.championId), 'pool-icon', c.name)}
      <span class="pool-name">${esc(c.name)}</span>
      <span class="pool-games">${c.games} ${gier(c.games)}</span>
      <span class="pool-wr ${c.games >= 20 ? pctClass(c.winRate) : ''}"${c.games < 20 ? ' title="Mała próba gier"' : ''}>${c.winRate != null ? `${c.winRate}%` : '–'}</span>
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
          ${stat(r ? r.winRate : null, 'Sezon', r && r.games ? games(r.games) : 'brak gier', r?.games)}
          ${stat(c.seasonWinRate, 'Champion', c.seasonBelow ? `&lt; ${c.seasonBelow} ${gier(c.seasonBelow)}` : games(c.seasonGames), c.seasonGames)}
          ${stat(rec.last30WinRate, 'Ostatnie 30 dni', rec.last30More ? `próba ${games(rec.last30Days)}` : games(rec.last30Days), rec.last30Days)}
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
    <h2>${g.mode === 'aram' ? 'Plan na ARAM' : 'Plan na grę'}</h2>
    <div class="gp-styles"><span class="ally-c">Wy</span>${styles(g.ourStyle)}<span class="enemy-c">Wróg</span>${styles(g.theirStyle)}</div>
    ${g.phases.map((ph) => `<div class="gp-phase"><h4>${esc(ph.title)}</h4><ul class="plan-tips">${ph.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}
    ${people('Uważajcie na', g.threats, 'bad')}
    ${people('Kontekst danych · bez oceny umiejętności', g.targets, 'muted')}
  </div>`;
}

function priorityAdvicePanel(s) {
  const b = s.final?.build || s.build;
  if (b?.mode === 'mayhem') return '';
  const tips = [];
  if (s.plan?.tips?.[0]) tips.push({ label: 'Na linii', text: s.plan.tips[0] });
  const mid = s.gamePlan?.phases?.find((p) => /Środek|Wasz styl|Walki drużynowe/.test(p.title));
  if (mid?.tips?.[0]) tips.push({ label: 'W walkach', text: mid.tips[0] });
  const priority = b?.items?.find((i) => i.priority);
  if (priority) tips.push({ label: 'Priorytet zakupów', text: `${priority.name} wcześniej — ${priority.why}.` });
  for (const x of (b?.situations || []).filter((x) => x.item?.mine)) {
    if (tips.length >= 3) break;
    if (priority?.id === x.item.id) continue;
    tips.push({ label: 'Dla Ciebie', text: `${x.text}. ${x.item.name}: ${x.item.inBuild ? 'uwzględniony w buildzie' : 'opcja sytuacyjna'}.` });
  }
  if (!tips.length) return '';
  return `<section class="panel priority-advice"><h3>Najważniejsze na ten mecz</h3><div class="priority-grid">${tips.slice(0, 3).map((t, i) => `<div class="priority-tip"><span class="tip-number">${i + 1}</span><div><h4>${esc(t.label)}</h4><p>${esc(t.text)}</p></div></div>`).join('')}</div></section>`;
}

function runeSummary(m) {
  if (!m?.runes || m.runes.disabled) return '';
  const r = m.runes;
  return `<div class="rune-summary">${img(r.keystone.icon, 'rune', r.keystone.name)}<div><b>${esc(r.keystone.name)}</b><span class="muted"> · ${esc(r.primaryStyle)} + ${esc(r.subStyle)}</span>${r.adaptations.length ? `<div class="note">${esc(r.adaptations[0])}${r.adaptations.length > 1 ? ` · +${r.adaptations.length - 1} zmian w szczegółach` : ''}</div>` : '<div class="note">Baza run dla championa i roli</div>'}</div></div>`;
}

function adviceDetails(list) {
  const mine = (list || []).filter((x) => x.item?.mine);
  const team = (list || []).filter((x) => !x.item?.mine);
  return (mine.length ? disclosure('my-advice', 'Wszystkie odpowiedzi na zagrożenia dla Ciebie', situationsPanel(mine, 'Dla Twojej postaci')) : '')
    + (team.length ? disclosure('team-advice', 'Porady i zakupy dla drużyny', situationsPanel(team, 'Dla drużyny')) : '');
}

function loadingScreen(s) {
  const tab = loadingTab;
  const aram = isAramView(s.mode);
  const tabs = `<div class="seg loading-tabs" role="tablist" aria-label="Widok meczu">
      <button role="tab" aria-selected="${tab === 'overview'}" data-loading-tab="overview" class="${tab === 'overview' ? 'on' : ''}">${s.mode==='mayhem'?'Build i augmenty':'Build i plan'}</button>
      <button role="tab" aria-selected="${tab === 'build'}" data-loading-tab="build" class="${tab === 'build' ? 'on' : ''}">${s.mode==='mayhem'?'Czary i szczegóły':'Runy i szczegóły'}</button>
      <button role="tab" aria-selected="${tab === 'players'}" data-loading-tab="players" class="${tab === 'players' ? 'on' : ''}">${aram?'Składy drużyn':'Gracze i statystyki'}</button>
    </div>`;
  const plans = `${s.plan || s.gamePlan ? `<div class="plans${s.plan && s.gamePlan ? '' : ' single'}">${planPanel(s.plan)}${gamePlanPanel(s.gamePlan)}</div>` : '<p class="muted">Plan pojawi się po odczytaniu składów.</p>'}`;
  const list = s.final?.build?.situations || s.gamePlan?.situations || [];
  const planDetails = s.mode === 'mayhem' ? '' : disclosure('full-plan', aram ? 'Plan walk na ARAM-ie' : 'Pełny plan na linię i grę', plans);
  const roster = players => `<div class="aram-roster">${players.map(p=>`<div>${img(p.championView?.icon,'icon',p.championView?.name)}<b>${esc(p.championView?.name || 'Nieznany champion')}</b></div>`).join('')}</div>`;
  const body = tab === 'players' && aram ? `<p class="note">${s.mode==='mayhem'?'Mayhem':'ARAM'}: bez rang, winrate i wskazówek z soloQ.</p><h3 class="ally-h">Twoja drużyna</h3>${roster(s.allies)}<h3 class="enemy-h">Przeciwnicy</h3>${roster(s.enemies)}` : tab === 'players'
    ? `<p class="note">Winrate opisuje widoczną próbę gier. Mała próba i inna rola nie przesądzają o umiejętnościach gracza.</p><h3 class="ally-h">Twoja drużyna</h3><div class="pgrid">${s.allies.map((p) => playerCardHtml(p, 'ally')).join('')}</div><h3 class="enemy-h">Przeciwnicy</h3><div class="pgrid">${s.enemies.map((p) => playerCardHtml(p, 'enemy')).join('')}</div>`
    : tab === 'build'
      ? `${s.final?.myChampion ? myChampionPanel(s.final.myChampion, true) : '<p class="muted">Czekam na dane postaci.</p>'}${priorityAdvicePanel(s)}${planDetails}${adviceDetails(list)}`
    : `${s.final?.build ? buildPanel(s.final.build, true) : '<div class="panel"><h3>Build</h3><p class="muted">Czekam na dane Twojej postaci.</p></div>'}
      ${priorityAdvicePanel(s)}
      ${runeSummary(s.final?.myChampion)}
      ${planDetails}
      ${adviceDetails(list)}`;
  return `<div class="loading-screen">
    ${tabs}
    ${body}
    <footer><span class="stats-status ${s.statsStatus && s.statsStatus.ok ? 'ok' : ''}">${esc(s.statsStatus ? s.statsStatus.message : '')}${s.region ? ` · serwer ${esc(s.region)}` : ''}</span>${aram?'':'<button data-stats-diag>Diagnostyka OP.GG</button>'}</footer>
  </div>`;
}

// Aktualizacja widoku bez przebudowy: zmieniamy tylko węzły, które się różnią, więc obrazki nie ładują się od nowa,
// przewinięcie i najechanie myszą zostają, a animację wejścia dostają tylko nowe panele.
function morph(from, to) {
  if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) { from.replaceWith(to); return; }
  if (from.nodeType !== 1) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; return; }
  for (const a of [...from.attributes]) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
  for (const a of [...to.attributes]) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  morphChildren(from, to);
}
function morphChildren(from, to) {
  const before = [...from.childNodes];
  const after = [...to.childNodes];
  after.forEach((node, i) => (i < before.length ? morph(before[i], node) : from.appendChild(node)));
  before.slice(after.length).forEach((node) => node.remove());
}
function patch(el, html) {
  const next = document.createElement(el.tagName);
  next.innerHTML = html;
  morphChildren(el, next);
}

function render(s) {
  if (!s) return;
  const previous = lastState;
  lastState = s;
  if (!labActive && (s.mode !== 'mayhem' || s.final?.build?.mayhem?.matchKey !== previous?.final?.build?.mayhem?.matchKey)) document.getElementById('mayhem-dialog')?.close();
  if (labActive) {
    if (s.status === 'champselect' && previous?.status !== 'champselect') {
      labActive = false; labRevision++; document.getElementById('draft-lab').textContent = 'Tester draftów';
      document.getElementById('choices-dialog')?.close(); document.getElementById('mayhem-dialog')?.close(); editorContext = null; toast('Rozpoczął się Twój champion select');
    } else return;
  }
  const [label, live] = STATUS[s.status] || ['', false];
  $status.textContent = s.status === 'error' ? `${label}: ${s.message}` : label;
  if (s.mode === 'mayhem') $status.textContent = s.status === 'champselect' ? 'Mayhem · wybór postaci' : 'ARAM: Mayhem';
  $status.className = 'status' + (live ? ' live' : '');

  if (s.status === 'loading-screen') {
    patch($app, loadingScreen(s));
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
    patch($app, `<div class="empty"><h2>${esc(msg[0])}</h2><div>${esc(msg[1])}</div>
      <p class="muted">Krzyżyk chowa aplikację do zasobnika obok zegara.<br>Pod jej ikoną ustawisz start z Windowsem i pokazywanie okna przy wyborze postaci.</p>${diag}</div>`);
    return;
  }

  const meLocked = s.myChampion && s.myChampion.locked;
  const center = [
    bansPanel(s),
    isAramView(s.mode) ? aramPanel(s) : !meLocked ? suggestionsPanel(s) : '',
    s.build ? buildPanel({ ...s.build, mode: s.mode }, false, s.autoItemSet) : '',
    s.build ? priorityAdvicePanel(s) : '',
    s.myChampion ? disclosure('runes', s.mode==='mayhem'?'Czary przywoływacza':'Runy, czary i dopasowanie do matchupu', myChampionPanel(s.myChampion, false, s.autoRunes)) : '',
    s.build ? adviceDetails(s.build.situations) : '',
    disclosure('compositions', 'Style obu drużyn', compPanel(s.compositions)),
  ].join('');

  patch($app, `<div class="layout${meLocked ? ' locked' : ''}">
    <section class="team ally"><h3>Twoja drużyna</h3>${s.allies.map((p) => slot(p, false)).join('')}</section>
    <section class="center">${center}
      <footer>
        <span class="stats-status ${s.statsStatus && s.statsStatus.ok ? 'ok' : ''}">${esc(s.statsStatus ? s.statsStatus.message : '')}</span>
        <button data-toggle-stats>${s.statsEnabled ? 'Wyłącz OP.GG' : 'Włącz OP.GG'}</button>
        ${s.mode==='mayhem'?'':`<button data-toggle-auto-runes>${s.autoRunes && s.autoRunes.enabled ? 'Auto-import run: wł.' : 'Auto-import run: wył.'}</button>`}
        <button data-toggle-auto-item-set>${s.autoItemSet && s.autoItemSet.enabled ? 'Auto-build do sklepu: wł.' : 'Auto-build do sklepu: wył.'}</button>
        <button data-stats-diag>Diagnostyka OP.GG</button>
        <button data-open-data>Edytuj dane</button><button data-reload-data>Wczytaj dane ponownie</button>
      </footer>
    </section>
    <section class="team enemy"><h3>Przeciwnicy</h3>${isAramView(s.mode) && !s.enemies.length ? '<div class="muted">Na ARAM-ie przeciwników widać dopiero na ekranie ładowania.</div>' : ''}${s.enemies.map((p) => slot(p, true)).join('')}${enemyBar(s.enemyProfile)}</section>
  </div>`);
}

$app.addEventListener('toggle', (e) => {
  if (e.target.matches('details[data-detail]')) expanded.set(`detail:${e.target.dataset.detail}`, e.target.open);
}, true);

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
      itemSetProblem = res.ok || !res.itemSetGroups ? null : { groups: res.itemSetGroups };
      res.ok ? toast(`Wysłano do sklepu: ${res.name}`) : toast(res.error, true);
      render(lastState);
    } else if (btn.dataset.cleanSets) {
      const res = await window.assist.cleanItemSets(btn.dataset.cleanSets);
      if (!res.ok) { toast(res.error, true); return; }
      const sent = await window.assist.exportItemSet(btn.dataset.alias);
      itemSetProblem = sent.ok || !sent.itemSetGroups ? null : { groups: sent.itemSetGroups };
      sent.ok ? toast(`Usunięto ${res.removed} zestawów i wysłano: ${sent.name}`) : toast(sent.error, true);
      render(lastState);
    } else if (btn.dataset.spells) {
      const res = await window.assist.setSpells(btn.dataset.spells);
      res.ok ? toast('Ustawiono czary przywoływacza') : toast(res.error, true);
    } else if ('toggleStats' in btn.dataset) {
      const res = await window.assist.toggleStats();
      res.ok ? toast(res.enabled ? 'Statystyki OP.GG włączone' : 'Statystyki OP.GG wyłączone, używam własnych danych') : toast(res.error, true);
    } else if ('toggleAutoItemSet' in btn.dataset) {
      const res = await window.assist.toggleAutoItemSet();
      res.ok ? toast(res.enabled ? 'Build wyśle się sam do sklepu po zablokowaniu wszystkich' : 'Automatyczne wysyłanie buildu wyłączone') : toast(res.error, true);
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

// Ten sam stan z procesu głównego nie przebudowuje widoku (obrazki nie mrugają, przyciski nie gubią kliknięć).
let lastStateJson = '';
window.assist.onState((s) => {
  const json = JSON.stringify(s);
  if (json === lastStateJson) return;
  lastStateJson = json;
  render(s);
});
window.assist.getState().then(render);

$app.addEventListener('error', e => { if (e.target.tagName !== 'IMG') return; const i=e.target; const fallback=document.createElement('span'); fallback.className=i.className + ' icon-fallback'; fallback.textContent=(i.alt || 'LoL').slice(0,3); fallback.title=i.alt; i.replaceWith(fallback); }, true);
