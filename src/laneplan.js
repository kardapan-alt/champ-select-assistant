// Plan na linię na ekranie ładowania: Twój przeciwnik z linii, wynik matchupu i kilka konkretnych wskazówek.
// Korzysta tylko z championów i statystyk graczy, które są widoczne od ekranu ładowania.
const { champInfo, isRanged, matchupVerdict } = require('./engine');

const toDataRole = (pos) => ({ utility: 'support', mid: 'middle', adc: 'bottom', bot: 'bottom' }[pos] || pos || '');

// Przeciwnik z tej samej pozycji; gdy klient nie podaje pozycji, zgadujemy po głównej roli championa.
function findLaneOpponent(me, enemies, game, data) {
  const aliasOf = (id) => game.championsById.get(id)?.alias;
  const myRole = toDataRole(me.position) || (champInfo(aliasOf(me.championId), game, data).roles || [])[0] || '';
  if (!myRole) return null;
  const byPosition = enemies.find((e) => toDataRole(e.position) === myRole);
  if (byPosition) return { player: byPosition, role: myRole };
  const byRole = enemies.find((e) => e.championId && (champInfo(aliasOf(e.championId), game, data).roles || [])[0] === myRole);
  return byRole ? { player: byRole, role: myRole } : null;
}

const VERDICT = {
  good: 'Korzystny matchup: wymieniaj się agresywnie i buduj przewagę przed pierwszym powrotem.',
  bad: 'Trudny matchup: farm bezpiecznie, unikaj długich wymian i graj pod pomoc junglera.',
  even: 'Wyrównany matchup: decydują wymiany przy fali i to, kto dostanie pomoc junglera.',
};

// me: Ty z ekranu ładowania; enemies: drużyna wroga; cardFor(player): karta gracza z tagami ze statystyk.
function lanePlan(me, enemies, cardFor, game, data) {
  if (!me || !me.championId) return null;
  const aliasOf = (id) => game.championsById.get(id)?.alias;
  const name = (alias) => game.championsByAlias.get(alias)?.name || alias;
  const myAlias = aliasOf(me.championId);
  if (!myAlias) return null;
  const found = findLaneOpponent(me, enemies, game, data);
  if (!found) return null;
  const champ = champInfo(myAlias, game, data);
  const laneAlias = aliasOf(found.player.championId);
  if (!laneAlias) return null;
  const lane = champInfo(laneAlias, game, data);
  const laneName = name(laneAlias);
  const rate = champ.matchupRates && champ.matchupRates[laneAlias];
  // Winrate z OP.GG ma pierwszeństwo przed listami kontr, żeby ocena zgadzała się z liczbą pokazaną obok.
  const verdict = rate != null ? (rate >= 51.5 ? 'good' : rate <= 48.5 ? 'bad' : 'even') : matchupVerdict(champ, lane);
  const tips = [];

  tips.push(VERDICT[verdict]);

  // Styl przeciwnika: pierwsza pasująca wskazówka (jedna, żeby nie zasypać ekranu).
  const lt = lane.traits || [];
  const mine = champ.traits || [];
  const traitTip = [
    [lane.class === 'assassin' || lt.includes('burst'), `${laneName} ma duży burst: od 6 poziomu trzymaj zdrowie wysoko i nie stój sam przy rzece.`],
    [lt.includes('early') && !mine.includes('early'), `${laneName} jest najmocniejszy na początku: przetrwaj pierwsze poziomy, później wymiany są łatwiejsze.`],
    [lt.includes('scaling') && !mine.includes('scaling'), `${laneName} rośnie w siłę z czasem: wygrywaj linię wcześnie, zanim zbuduje itemy.`],
    [(lt.includes('poke') || isRanged(lane)) && !isRanged(champ), `${laneName} atakuje z dystansu: stój za minionami i wchodź w wymiany, gdy zużyje umiejętności.`],
    [lt.includes('heal'), `${laneName} dużo się leczy: wcześniej kup komponent z antyleczeniem, jeśli przegrywasz wymiany.`],
    [lt.includes('engage') || lt.includes('cc'), `${laneName} ma twarde CC: po jego unieruchomieniu może wpaść jungler, warduj krzaki.`],
    [lt.includes('splitpush'), `${laneName} lubi splitpush: po fazie linii pilnuj boku mapy.`],
  ].find(([when]) => when);
  if (traitTip) tips.push(traitTip[1]);

  // Gracz z linii: wskazówki z jego tagów (karta gracza ze statystyk).
  const oppCard = cardFor ? cardFor(found.player) : null;
  const player = found.player.gameName || 'Przeciwnik';
  const tags = oppCard ? oppCard.tags.map((t) => t.text) : [];
  const has = (prefix) => tags.find((t) => t.startsWith(prefix));
  const playerTip = [
    [has('Dużo zgonów'), `${player} często ginie ${(has('Dużo zgonów') || '').replace('Dużo zgonów ', '')}: szukaj zabójstwa, gdy wyjdzie za daleko.`],
    [has('Mało gier tym championem'), `${player} rzadko gra ${laneName}: karz jego błędy na początku gry.`],
    [has('Gra poza swoją rolą'), `${player} zwykle gra inną rolę: na linii może być słabszy niż w statystykach.`],
    [has('OTP') || has('Doświadczony'), `${player} zna ${laneName} bardzo dobrze: nie licz na proste błędy, graj pewnie.`],
    [has('Seria') && has('Seria').includes('porażek'), `${player} ma serię porażek: może grać ryzykownie, cierpliwość się opłaci.`],
  ].find(([when]) => when);
  if (playerTip) tips.push(playerTip[1]);

  // Jungler wroga mocny na początku: ostrzeżenie o wczesnych gankach.
  if (found.role !== 'jungle') {
    const jungler = enemies.find((e) => toDataRole(e.position) === 'jungle')
      || enemies.find((e) => e.championId && (champInfo(aliasOf(e.championId), game, data).roles || [])[0] === 'jungle');
    const jAlias = jungler && aliasOf(jungler.championId);
    const jt = jAlias ? champInfo(jAlias, game, data).traits || [] : [];
    if (jAlias && (jt.includes('early') || jt.includes('pick'))) tips.push(`Ich jungler (${name(jAlias)}) jest groźny wcześnie: postaw ward w rzece przed 3. minutą.`);
  }

  // Pierwszy item obronny pod typ obrażeń przeciwnika z linii.
  const early = data.earlyDefense || {};
  const firstBackId = lane.dmg === 'ap' ? early.ap : lane.dmg === 'ad' ? early.ad : null;
  const it = firstBackId && game.items.get(firstBackId);
  const firstBack = firstBackId ? { id: firstBackId, name: it ? it.name : String(firstBackId), icon: it ? it.iconPath : '' } : null;

  return {
    role: found.role,
    me: { championId: me.championId, name: name(myAlias) },
    opponent: { championId: found.player.championId, name: laneName, player: found.player.gameName ? `${found.player.gameName}#${found.player.tagLine}` : '' },
    opponentIndex: enemies.indexOf(found.player),
    verdict,
    winRate: rate != null ? rate : null,
    damage: lane.dmg === 'ap' ? 'magiczne' : lane.dmg === 'ad' ? 'fizyczne' : 'mieszane',
    tips: tips.slice(0, 4),
    firstBack,
  };
}

module.exports = { lanePlan, findLaneOpponent };
