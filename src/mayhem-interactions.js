const evidence = require('../data/mayhem-rule-evidence.json');
const { patchOf } = require('./data-freshness');

// Polish paraphrases checked against the Riot card descriptions indexed in
// mayhem-rule-evidence.json. Item passive names/effects are from Data Dragon
// 16.22.1, en_US/item.json. These describe triggers, not measured in-game procs.
const reviewedPatch = '16.22';
const itemEffects = {
  3115: 'Icathian Bite zadaje obrażenia magiczne przy trafieniu.',
  3153: 'Mist’s Edge zadaje przy trafieniu obrażenia zależne od aktualnego zdrowia celu.',
  3091: 'Fray zadaje obrażenia magiczne przy trafieniu.',
  3748: 'Cleave zadaje obrażenia fizyczne przy trafieniu.',
  3157: 'Time Stop to aktywna umiejętność przedmiotu, która zapewnia stazę.',
  6653: 'Torment podpala cel trafiony umiejętnością i zadaje obrażenia w czasie.',
  3116: 'Rimefrost spowalnia wrogów trafionych umiejętnością zadającą obrażenia.',
};
const onHitExamples = [3115, 3153, 3091, 3748];
const mechanics = {
  Upgrade_Collector: 'Egzekucja efektem The Collector zwiększa próg kolejnych egzekucji i daje dodatkowe złoto.',
  Upgrade_IE: 'Gdy masz Infinity Edge, każdy atak otrzymuje losową premię do obrażeń krytycznych zależną od szansy na trafienie krytyczne.',
  Upgrade_ZH: 'Zhonya’s Hourglass ma krótsze odnowienie. Podczas stazy Zhonyi, Seeker’s Armguard lub Wooglet’s Witchcap możesz poruszać się z premią do prędkości.',
  Upgrade_SunderedSky: 'Sundered Sky odnawia swój efekt szybciej na każdym celu i leczy o część brakującego zdrowia.',
  Upgrade_Ravenous: 'Trafienia zaklęciami uruchamiają Cleave. Ravenous Hydra otrzymuje większą kradzież życia.',
  Upgrade_DeathDance: 'Death’s Dance rozkłada w czasie większą część otrzymanych obrażeń. Udział w zabójstwie natychmiast przywraca więcej zdrowia.',
  Upgrade_Stormsurge: 'Squall ze Stormsurge zawsze wybucha obszarowo. Zadaje obrażenia magiczne zależne od maksymalnego zdrowia i oznacza bohaterów trafionych pierwszym wybuchem.',
  Upgrade_SwordOfBlossom: 'Zyskujesz szybkość ataku. Ataki we wrogich bohaterów zwiększają leczenie zapewniane przez Sword of Blossoming Dawn.',
  Upgrade_ZzRotPortal: 'Zz’Rot Portal przywołuje więcej stworów. Dodatkowe stwory pojawiają się również po zniszczeniu portalu.',
  Upgrade_DeathFireGrasp: 'Deathfire Grasp silniej wzmacnia obrażenia, szybciej się odnawia i obejmuje wrogich bohaterów wokół celu.',
  Upgrade_InnervatingLocket: 'Innervating Locket przywraca więcej zdrowia i many. Efekt obejmuje również sojuszników wokół celu.',
  Upgrade_Immolate: 'Sunfire Aegis i Hollow Radiance dają złoto za cele objęte efektem Immolate.',
  Upgrade_Sheen: 'Efekt Spellblade zadaje dodatkowe obrażenia i leczy Cię o część zdrowia celu.',
  Quest_SteelYourHeart: 'Zadanie wymaga posiadania Heartsteela z odpowiednią liczbą ładunków. Nagroda mnoży zgromadzone ładunki.',
  Quest_WoogletsWitchcap: 'Otrzymujesz Needlessly Large Rod. Posiadanie Rabadon’s Deathcap i Zhonya’s Hourglass odblokowuje nagrodę Wooglet’s Witchcap.',
  Quest_VoidImmolation: 'Otrzymujesz Bami’s Cinder. Po zdobyciu Sunfire Aegis i Hollow Radiance oba przedmioty łączą się w Void Immolation.',
  Quest_UltraHydra: 'Ukończenie Hydry daje Tiamat. Zdobycie Ravenous, Profane i Titanic Hydry odblokowuje Ultra Hydrę.',
  Quest_UrfsChampion: 'Udziały w zabójstwach odblokowują Golden Spatula. Zakup przedmiotu nie jest warunkiem zadania.',
  Quest_Sneakerhead: 'Otrzymujesz ulepszone buty. Wykonywanie ich zadań prowadzi do nagrody Jarvan I’s Boot.',
  FutureSightHeartsteel: 'Po osiągnięciu wymaganego dodatkowego zdrowia otrzymujesz Heartsteel.',
  TrueEternity: 'Możesz kupić kilka Rod of Ages. Ich ładunki rosną szybciej i nie mają limitu.',
  DontStopCleavin: 'Możesz kupić kilka Black Cleaverów. Statystyki nowej kopii zależą od liczby już posiadanych.',
  DoOrDie: 'Maksymalna liczba ładunków Mejai’s Soulstealer, Leviathana i Sword of the Occult podwaja się.',
  HexCore: 'Otrzymujesz Prototype Hex Core. Wydawanie złota na jego ulepszenia trwale wzmacnia umiejętności.',
  DoransBiggestFan: 'Kolejne zakupy przedmiotu Dorana zwiększają liczbę ładunków i statystyki pierwszego egzemplarza.',
  WeaponOfDestiny: 'Twój pierwszy przedmiot legendarny otrzymuje dodatkowe statystyki za udziały w zabójstwach bohaterów.',
  ApexInventor: 'Przyspieszenie przedmiotów skraca odnowienie ich umiejętności.',
  Vulnerability: 'Efekty zadające obrażenia z przedmiotów oraz obrażenia w czasie mogą trafić krytycznie.',
  IceCold: 'Twoje efekty spowalniające dodatkowo zmniejszają prędkość ruchu celu.',
  EtherealWeapon: 'Umiejętności nakładają efekty przy trafieniu. Każdy cel ma osobny, jednosekundowy czas odnowienia.',
  DoubleStrike: 'Umiejętność wskazana na karcie nakłada efekty przy trafieniu jeden dodatkowy raz.',
  BEES: 'Pszczoły wypuszczone po trafieniu umiejętnością nakładają efekty przy trafieniu.',
  CrimsonCobalt: 'Wzmocniona umiejętność oznacza trafionego bohatera. Atak w oznaczony cel zadaje dodatkowe obrażenia magiczne i skraca odnowienie tej umiejętności.',
  Nightstalking: 'Udział w zabójstwie wkrótce po zadaniu obrażeń bohaterowi zapewnia prędkość ruchu i niewidzialność.',
};
const examples = { EtherealWeapon:onHitExamples, DoubleStrike:onHitExamples, BEES:onHitExamples,
  ApexInventor:[3157], Vulnerability:[6653], IceCold:[3116] };

function itemInteraction(augment, champion, game) {
  const key = augment.api.replace(/^ARAM_/, '');
  const source = evidence.augments[augment.api];
  if (!source || evidence.patch !== reviewedPatch || !mechanics[key]) return null;
  const currentPatch = patchOf(game?.provenance?.version);
  const zedCobalt = key === 'CrimsonCobalt' && champion?.alias === 'Zed';
  return {
    mechanic: zedCobalt ? 'Q Zeda oznacza trafionego bohatera. Atak w ten cel zadaje dodatkowe obrażenia magiczne i skraca odnowienie Q.' : mechanics[key],
    purchase: key === 'CrimsonCobalt' ? 'Oznaczenie działa bez specjalnego przedmiotu. Sam ten efekt nie daje premii zakupowej Guinsoo ani przedmiotom ze Spellblade.' : null,
    examples: (examples[key] || []).filter(id => game?.items?.has(id)).map(id => ({
      id, name:game.items.get(id).name, effect:itemEffects[id],
    })),
    patch: reviewedPatch, otherPatch: currentPatch && currentPatch !== reviewedPatch ? currentPatch : null,
    descriptionKey: source.description,
  };
}
module.exports = { itemInteraction, onHitExamples };
