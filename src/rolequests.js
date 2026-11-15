// Quest przypisuje pozycja w lobby, nie klasa championa.
// Zasady: Riot, patch 26.1; dane i nazwy przedmiotów bierzemy z klienta.
// https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/
const BOOT_UPGRADES = { 3006: 3172, 3008: 3168, 3009: 3170, 3158: 3171, 3111: 3173, 3047: 3174, 3020: 3175 };
const SUPPORT_ITEMS = new Set([3865, 3866, 3867, 3869, 3870, 3871, 3876, 3877]);
const QUESTS = {
  bottom: {
    role: 'bottom', label: 'Bot', extraSlot: 'boots',
    summary: 'Po queście bota: 6 przedmiotów + buty w bocznym slocie.',
    detail: 'Przed ukończeniem questa buty zajmują zwykły slot: zmieścisz obok nich 5 przedmiotów. Szósty zakup zaplanowano na późną grę po queście, bez sprzedawania butów.',
  },
  utility: {
    role: 'utility', label: 'Support', extraSlot: 'control-wards',
    summary: '4 zakupy + buty + przedmiot wsparcia; po queście Control Wardy z boku.',
    detail: 'Przedmiot wsparcia nadal zajmuje zwykły slot. Po queście do 2 Control Wardów mieści się w osobnym slocie questa, więc nie rezerwujemy na nie kolejnego miejsca w pełnym buildzie.',
  },
  middle: {
    role: 'middle', label: 'Mid', extraSlot: null,
    summary: 'Po queście mida: darmowe ulepszenie butów, bez dodatkowego slotu.',
    detail: 'Kup zwykłe ulepszone buty. Quest ulepszy je za darmo i da wzmocniony powrót do bazy. Ulepszenie zastępuje buty w tym samym slocie — nie jest kolejnym zakupem.',
  },
  top: {
    role: 'top', label: 'Top', extraSlot: null,
    summary: 'Quest topa: nagrody do doświadczenia i Teleportu; 6 zwykłych slotów.',
    detail: 'Quest topa poprawia skalowanie doświadczenia i daje Teleport lub premię do wybranego Teleportu. Nie zwiększa liczby slotów na przedmioty.',
  },
  jungle: {
    role: 'jungle', label: 'Jungle', extraSlot: null,
    summary: 'Quest jungli: rozwój peta i Smite; 6 zwykłych slotów.',
    detail: 'Przedmiot junglera jest zakupem startowym. Po ukończeniu questa nie zajmuje miejsca w docelowym ekwipunku, więc nie rezerwujemy dla niego slotu w pełnym buildzie.',
  },
};

function roleQuestsEnabled(flow) {
  const queue = flow?.gameData?.queue;
  if (!queue || Number(flow.map?.id ?? queue.mapId) !== 11 || String(queue.gameMode).toUpperCase() !== 'CLASSIC') return false;
  // Znane kolejki SR z questami. Swiftplay (480), ARAM i tryby rotacyjne
  // nie dziedziczą bonusów tylko dlatego, że ktoś ma rolę „bottom”.
  return [0, 400, 420, 440, 490, 700, 870, 880, 890].includes(Number(queue.id));
}

function roleQuestFor(state) {
  if (state?.mode === 'aram' || state?.roleQuestsEnabled === false) return null;
  const assigned = state?.me?.position;
  return QUESTS[assigned === 'support' ? 'utility' : assigned] || null;
}

const baseBoots = (id) => Number(Object.keys(BOOT_UPGRADES).find((base) => BOOT_UPGRADES[base] === Number(id)) || id);
function isBootItem(id, game) {
  const item = game.items.get(Number(id));
  return [1001, 2422, ...Object.keys(BOOT_UPGRADES).map(Number), ...Object.values(BOOT_UPGRADES)].includes(Number(id))
    || [...(item?.categories || []), ...(item?.tags || [])].includes('Boots');
}

module.exports = { roleQuestsEnabled, roleQuestFor, BOOT_UPGRADES, SUPPORT_ITEMS, baseBoots, isBootItem };
