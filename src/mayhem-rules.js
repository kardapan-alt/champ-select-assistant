// Jawnie przejrzane efekty KIWI / KIWI_JADE, patch 16.22 (26.22).
// Pochodzenie każdego opisu: data/mayhem-rule-evidence.json.
// Brak domyślnej reguły „obsługiwany”: nowy augment wymaga przeglądu i testów.
const rules = {};
function rule(names, effects, summary, extra = {}) {
  for (const name of names.split('|')) {
    if (rules[name]) throw Error(`Powtórzona reguła Mayhem: ${name}`);
    rules[name] = { effects, summary, ...extra };
  }
}
const neutral = (names, summary) => rule(names, [], summary, { neutral:true });

rule('Goliath|TankEngine', ['health'], 'Premia do maksymalnego zdrowia wzmacnia zakupy HP; dobieram je do klasy postaci.');
rule('CelestialBody', ['health','resists'], 'Duża pula HP i mniejsze obrażenia sprzyjają wytrzymałości: zdrowie łączę z odpornościami.');
rule('ImTheJuggernaut|Adamant|TitansPulse|WardingWeapon', ['health'], 'Augment dostarcza odporności podczas walki. Zdrowie pomaga wykorzystać dodatkowy pancerz i MR.');
rule('HeavyHitter', ['health','healthhit'], 'Autoataki skalują się z maksymalnym HP: premiuję zdrowie, Titanic Hydrę i odpowiednie tempo ataków.');
rule('MountainSoul', ['health'], 'Tarcza po wyjściu z walki wspiera wytrzymałość. U tanków rozwijam HP; u carry zachowuję ich skalowanie obrażeń.');
rule('DawnbringersResolve|EscapePlan|Salvation', ['resists'], 'Leczenie lub tarcza przy niskim HP daje czas na przeżycie. Dobieram odporności do obrażeń wroga.');
rule('CourageoftheColossus', ['cc','health'], 'Unieruchomienie daje tarczę. Premiuję częstsze użycie kontroli tłumu i wytrzymałość.');
rule('Impassable', ['cc','resists'], 'Aftershock i Glacial Augment nagradzają kontrolę tłumu: preferuję wytrzymałe zakupy z haste.');
rule('OutlawsGrit|SwiftAndSafe', ['spell','health'], 'Doskoki uruchamiają ochronę. Wspieram cykl umiejętności i HP bez wymuszania przedmiotów innej klasy.');
rule('SlapAround|SoulEater|Cruelty|DarkWind', ['cc'], 'Unieruchomienia uruchamiają dodatkowe efekty. Przyspieszam odpowiednie dla postaci zakupy z haste.');
rule('ProteinShake', ['healresists'], 'Siła leczenia i tarcz rośnie z dodatkowym pancerzem i MR. Łączę przedmioty ochronne z leczeniem.');
rule('PressureCooker', ['health','burn'], 'Spalenie wokół postaci skaluje się z jej maksymalnym HP. Premiuję zdrowie i efekty spalania.');
rule('MoshMonster|GrowthSpurt', ['resists'], 'Augment zapewnia dodatkowe HP. Odporności pomagają wykorzystać je w zwarciu.');
rule('LonelyWarrior', ['health','onhit'], 'W pobliżu wrogów zyskujesz odporności i szybkość ataku: łączę zdrowie z on-hit.');
rule('PinCushion', ['health','resists'], 'Otrzymywanie obrażeń ładuje kolce. Priorytetem jest przeżycie kilku trafień, nie budowanie samego ataku.');

rule('Deft|FanTheHammer|GetExcited|LittleExtraHelp|FlowOfSpirit', ['attacks'], 'Premia do ataków wspiera istniejący styl gry. Sama szybkość lub zasięg nie zmienia maga, zabójcy ani tanka w postać on-hit.');
rule('Firebrand|DualWield|Typhoon|LightemUp|ShrinkRay|ThirdTimesTheHarm|HandsOffTheTalent', ['onhit'], 'Dodatkowe efekty ataków wspieram przedmiotami pasującymi do obecnego buildu. Nie wymuszam całego zestawu on-hit na postaci opartej na czarach.');
rule('ScopedWeapons|ScopierWeapons|ScopiestWeapons', ['attacks'], 'Większy zasięg ułatwia ataki, ale sam nie zmienia skalowania postaci. Zachowuję jej podstawowy kierunek zakupów.');
rule('EtherealWeapon|BEES|DoubleStrike', ['onhit'], 'Umiejętność lub pociski nakładają on-hit. Dopuszczam dopasowany przedmiot on-hit także dla czarującej postaci, zachowując pozostały rdzeń.', { abilityOnHit:true });
rule('MysticPunch|KeepGoing', ['onhit','spellblade'], 'Ataki skracają cooldown umiejętności. Wspieram przeplatanie czarów i autoataków.');
neutral('CrimsonCobalt', 'Traf bohatera umiejętnością wskazaną na karcie, a potem zaatakuj oznaczony cel. Obrażenia i skrócenie odnowienia działają niezależnie od zakupów.');
rule('TapDancer', ['onhit','move'], 'Ataki zwiększają ruch, a ruch wzmacnia szybkość ataku. Uwzględniam obie części tej synergii.');
rule('Marksmage', ['ap','onhit'], 'Autoataki zyskują obrażenia od AP: preferuję Nashor i moc umiejętności.', { attackAP:true });
rule('MasterofDuality', ['onhit','spell'], 'Ataki gromadzą AP, a trafienia umiejętnościami AD. Łączę oba rodzaje trafień bez porzucania klasy postaci.');
rule('SymphonyofWar|StillHere|DrawYourSword', ['onhit','sustain'], 'Długie walki i autoataki wykorzystują premie augmentu. Premiuję on-hit i odpowiednie źródła podtrzymania życia.');
rule('CriticalRhythm|CriticalMissile|Zealot|ItsCritical', ['crit'], 'Kryty i szybkość ataku wzmacniają kolejne trafienia. Priorytet dostają przedmioty krytyczne.');
rule('DoubleTap|Juiced', ['crit','onhit'], 'Kryty współpracują z efektami on-hit: buduję oba elementy zamiast samego AD.');
rule('SoulSiphon', ['crit','sustain'], 'Leczenie zależy od obrażeń krytycznych. Łączę mocne kryty z możliwością dłuższego atakowania.');
rule('TankItOrLeaveIt', ['defensivecrit'], 'Szansa na kryt daje też obronę. U tanków dodaję ograniczoną premię do krytów, zachowując HP i odporności.');
rule('BigShot', ['bigcrit'], 'Szybkość ataku zamienia się w obrażenia krytyczne. Premiuję mocne pojedyncze kryty i AD, nie spam on-hit.', { attackConversion:'crit' });
rule('TickleMonster', ['tickle'], 'AD zamienia się w szybkość ataku. Priorytetem są efekty on-hit i AP, a nie przedmioty oparte na fizycznym krycie.', { attackConversion:'onhit', exclude:[3031,6676] });
rule('Purist_Caster', ['spell'], 'Szybkość ataku zamienia się w haste. Buduję pod czary zamiast dokładać on-hit dla samego tempa ataków.', { attackConversion:'haste' });

rule('WitchfulThinking|PhenomenalEvil|Eureka|BigBrain|LichBrain', ['ap'], 'AP wzmacnia premię augmentu albo współpracuje z jej skalowaniem. Priorytetem jest moc umiejętności.');
rule('BluntForce', ['ad'], 'Procentowa premia AD zwiększa wartość zakupów z obrażeniami od ataku.');
rule('ADAPt', ['ap'], 'AD zamienia się w AP. Dalsze zakupy przechodzą na moc umiejętności.', { conversion:'ap' });
rule('escAPADe', ['ad'], 'AP zamienia się w AD. Dalsze zakupy przechodzą na obrażenia od ataku.', { conversion:'ad' });
rule('GiftoftheDrowned', ['healthlethality'], 'Bonusowe HP zamienia się w lethality, więc nie traktuję go jako obrony. U postaci fizycznych premiuję ofensywne zakupy HP.', { healthConversion:true, exclude:[3084,3083,2502] });
rule('JeweledGauntlet|JeweledBracelet', ['spellcrit'], 'Umiejętności mogą krytować. Łączę szansę na kryt z właściwym skalowaniem obrażeń postaci.');
rule('Twinfire', ['spellcrit'], 'Trafienia umiejętnościami odpalają pociski zależne od szansy na kryt. To synergia czarów i krytów, nie samych autoataków.');
rule('Vulnerability', ['burn','spellcrit'], 'Przedmioty i obrażenia w czasie mogą krytować. Premiuję pasujące źródła DoT oraz kryty.');
rule('Recursion|BreadAndButter|BreadAndCheese|BreadAndJam|InfiniteRecursion|SpecializedRecursion|HasteMakesWaste', ['adaptive'], 'Augment zapewnia haste. Uzupełniam częstsze czary obrażeniami lub siłą wsparcia właściwą dla postaci.');
rule('Dashing|SkilledSniper|SpinToWin', ['adaptive'], 'Wybrany rodzaj umiejętności działa częściej lub mocniej. Zachowuję właściwy typ obrażeń i wzmacniam jego zakupy.');
rule('Archmage|Overloaded', ['spell'], 'Rzucanie czarów skraca inne cooldowny. Wspieram cykl umiejętności odpowiednimi przedmiotami.');
rule('OneHitWonder|WithHaste', ['haste'], 'Haste zwiększa dodatkowo obrażenia umiejętności albo ruch. Premiuję zakupy z haste.');
rule('UltimateRecursion|UltimateAwakening|ArcaneAxiom', ['adaptive'], 'Augment przyspiesza ultimate. Wspieram jego obrażenia lub użyteczność zamiast dublować samą redukcję cooldownu.', { ultimate:true });
rule('CantTouchThis|FeyMagic|UltimateUnstoppable|ItsKillingTime|SurgeField|StuckInHereWithMe', ['ultimate'], 'Użycie ultimate uruchamia efekt augmentu. Uwzględniam pasujące przedmioty z haste na R.', { ultimate:true });
rule('UltimateRevolution', ['adaptive'], 'Dodatkowe użycie R wzmacniam właściwymi dla postaci statystykami obrażeń lub wsparcia.', { ultimate:true });
rule('FinalForm', ['health','ultimate'], 'Po R zyskujesz tarczę zależną od maksymalnego HP i premie bojowe. Łączę HP z częstszym ultimate.', { ultimate:true });
rule('BacktoBasics', ['spell'], 'Ultimate jest wyłączony. Buduję pod podstawowe czary i pomijam zakupy nastawione na R.', { noUltimate:true, exclude:[3118,6696] });
rule('Minionmancer|StackosaurusRex|HandOfBaron', ['adaptive'], 'Premia wzmacnia przywołańce, stałe stacki lub statystyki ofensywne. Rozwijam naturalne skalowanie championa.');
rule('FromBeginningToEnd|Erosion|ThreadtheNeedle|BurstingTeeth', ['adaptive'], 'Augment dostarcza dodatkowe obrażenia, shred lub przebicie. Uzupełniam je właściwymi obrażeniami postaci; odpowiedzi na tanków nadal zależą od wrogów.');
rule('SpellVolley|Multishot|Ability_SelfAOE_DoubleCast|Missile_Split|SpecializedEmpowerment|TrustyWeapon|Terraind|Recoil|RISE', ['spell'], 'Wzmocniona umiejętność zyskuje z obrażeń i częstego użycia. Dobieram zakupy do AP, AD lub roli wspierającej postaci.');
rule('Quickstep|Terror|ChainReaction|SnapBack|ItsGoTime', ['spell'], 'Augment dodaje efekt do umiejętności. Wspieram jej częstsze używanie bez wymuszania zmiany typu obrażeń.');
rule('GoH_PentakillAug_Q|GoH_PentakillAug_W|GoH_PentakillAug_E', ['spell'], 'Wzmocniona umiejętność otrzymuje haste oraz premie do obrażeń, leczenia i osłon. Rozwijam odpowiednie skalowanie championa.');
rule('GoH_PentakillAug_R', ['ultimate'], 'Wzmocniony ultimate otrzymuje haste oraz premie do obrażeń, leczenia i osłon. Rozwijam jego użyteczność.', { ultimate:true });
rule('Bonk', ['adaptive'], 'Wzmocniona umiejętność lub atak zadaje dodatkowe obrażenia. Rozwijam skalowanie championa; sam efekt nie nakłada wszystkich efektów on-hit.');
rule('ArmoredImpact', ['resists','spellblade'], 'Atak po czarze wykorzystuje pancerz. Wspieram obronę i jeden pasujący Spellblade, bez wymuszania Nashora czy Guinsoo.');
rule('TheBoomAndTheBass|BouncingBees|SapMagic', ['spellblade'], 'Przeplatanie czarów i ataków może wykorzystać jeden dopasowany Spellblade. Sam wzmocniony atak nie uzasadnia kompletu on-hit.');
rule('Overkill', ['attacks','sustain'], 'Ataki podczas umiejętności budują efekt. Rozwijam istniejący styl ataków i przeżywalność bez wymuszania dodatkowych efektów on-hit.');
rule('TakeemDownDownDown|EndlessHunt|Hellbent', ['adaptive','sustain'], 'Efekt uruchamiają zarówno ataki, jak i umiejętności. Rozwijam naturalne skalowanie postaci i przeżywalność zamiast wymuszać on-hit.');
rule('DivineDomain', ['adaptive'], 'Atak na esencję po zabójstwie resetuje podstawowe czary. To nie wymaga zakupu Spellblade; rozwijam naturalne obrażenia lub użyteczność postaci.');
rule('MagicMissile|BangBang', ['spell'], 'Trafienia umiejętnościami z dystansu uruchamiają dodatkowe pociski. Premiuję zakupy wspierające czary.');
rule('InfernalConduit|GrandmasChiliOil|BloodMoneyBurn', ['burn'], 'Augment współpracuje ze spalaniem i obrażeniami w czasie. Wybieram źródła DoT pasujące do postaci.');
rule('ForgedByTheMaster', ['itemdamage'], 'Wzmacniane są obrażenia przedmiotów i augmentów. Premiuję pasujące efekty obrażeń na itemach.');
rule('ApexInventor', ['itemhaste'], 'Haste przedmiotów skraca ich cooldowny. Premiuję użyteczne aktywy i efekty z czasem odnowienia.');
rule('MindtoMatter', ['mana','health'], 'Mana zwiększa maksymalne zdrowie. Zakupy z maną realizują oba cele; postać bez puli many nie dostaje tej premii zakupowej.', { manaHealth:true });
rule('Overflow', ['mana'], 'Podwójny koszt many i skalowanie efektów z jej pulą zwiększają priorytet zakupów many.');
rule('NoManaNoProblem', ['mana','ap'], 'Mana z przedmiotów zamienia się w AP. Premiuję pasujące zakupy many i moc umiejętności.', { manaConversion:true });
rule('DoubleTime', ['spell','mana'], 'Szybkie trafienie dwoma czarami daje maksymalną manę. Wspieram cykl umiejętności i przedmioty wykorzystujące manę.');
rule('BlueBarrier', ['mana','spell'], 'Wydawana mana daje tarczę. Premiuję manę i zakupy wspierające regularne czary.');
rule('StabbyStabby', ['lethality'], 'Lethality zwiększa cooldown reduction. U postaci fizycznych przyspieszam odpowiednie przedmioty z lethality.');

rule('AllForYou|FirstAidKit|WindspeakersBlessing|WeeWooWeeWoo|EmpyreanPromise|BabyKitty|DoubleDefense|GroupHug|Sound_Barrier', ['healing'], 'Premia wzmacnia leczenie lub osłony sojuszników. Dobieram siłę leczenia, tarcz i właściwe przedmioty wsparcia.');
rule('CriticalHealing', ['healing'], 'Leczenie i tarcze mogą krytować. Priorytetem pozostaje siła wsparcia; nie wymuszam zakupu AD u uzdrowiciela.');
rule('SonicBoom|EmpoweredByTheFaithful|SpiritBomb|EnchantingButterflies', ['healing','cc'], 'Wspieranie sojuszników uruchamia dodatkowy efekt. Premiuję leczenie, osłony i haste.');
rule('SearingDawn', ['spell'], 'Umiejętności oznaczają wrogów dla obrażeń sojusznika. Premiuję częstsze trafienia czarami; augment nie wymaga leczenia.');
rule('MercysStrike', ['healing'], 'Po wsparciu sojusznika zyskujesz pojedynczy wzmocniony atak. Rozwijam leczenie i osłony, bez wymuszania Nashora lub Guinsoo na enchanterze.');
rule('Sonata|LaserHeal|MissingPingAugment', ['healing'], 'Augment dodaje źródło leczenia lub osłon. Na wspierającej postaci wzmacniam je itemami, na carry zachowuję główną rolę.');
rule('CircleofDeath', ['regen','healing'], 'Własne leczenie i regeneracja zadają dodatkowe obrażenia. Rozwijam źródła odnowy HP, uwzględniając blokady innych augmentów.');
rule('Perseverance|OceanSoul|NatureIsHealing', ['regen'], 'Augment wzmacnia regenerację lub zapewnia leczenie. Rozwijam podtrzymanie życia odpowiednie dla postaci.');
rule('Goredrink|WarlockJuicebox|OminousPact|LittleDevil', ['sustain'], 'Leczenie z obrażeń lub koszt HP nagradza podtrzymanie życia. Dobieram sustain bez wymuszania itemów innej klasy.');
rule('Vampirism', ['sustain'], 'Leczenie od sojuszników i regeneracja są wyłączone. Buduję pod własne obrażenia i vamp, pomijając Warmoga.', { noRegen:true, exclude:[3083] });
rule('SustainingStrike|RabbleRousing', ['spell','sustain'], 'Użycie lub trafienie umiejętnością leczy. Wspieram cykl czarów i skuteczność własnego leczenia.');
rule('Equilibrium', ['selfheal'], 'Cudze leczenie odnawia także Twoje HP. Spirit Visage może wzmocnić otrzymywane leczenie na wytrzymałej postaci.');
rule('DontChangeTheChannel', ['resists'], 'Kanałowanie buduje osłonę. Odporności zwiększają wartość jej efektywnej wytrzymałości.');
rule('MightyShield', ['shield'], 'Otrzymanie tarczy daje siłę adaptacyjną. Preferuję użyteczne dla championa przedmioty zapewniające osłonę.');

rule('DontBlink', ['move'], 'Przewaga prędkości ruchu zwiększa obrażenia. Uwzględniam pasujące przedmioty z ruchem.');
rule('IceCold', ['slow'], 'Wzmocnione spowolnienia zwiększają wartość pasujących przedmiotów nakładających slow.');
rule('GlassCannon', ['adaptive','shield'], 'Mniej maksymalnego HP oznacza większe ryzyko. Łączę skalowanie obrażeń z osłoną lub stazą pasującą do postaci.');
rule('GiantSlayer', ['move','adaptive'], 'Mały rozmiar i mobilność wspierają obrażenia przeciw większym celom. Zachowuję ofensywne skalowanie championa.');
rule('HeavyIsTheCrown', ['move'], 'Siła ofensywna kosztuje prędkość ruchu. Dobieram mobilność, która pozwoli wykorzystać dodatkowe obrażenia.');

rule('Upgrade_Sheen', [], 'Przyspieszam jeden przedmiot ze Spellblade dobrany do postaci. Nie kupuj kilku wariantów dla tego samego efektu.', { upgrade:true, spellbladeUpgrade:true, anyItem:true, items:[3100,3078,6662,2510,3508] });
for (const [name,items] of Object.entries({ Upgrade_Collector:[6676], Upgrade_IE:[3031], Upgrade_ZH:[3157],
  Upgrade_SunderedSky:[6610], Upgrade_Ravenous:[3074], Upgrade_DeathDance:[6333],
  Upgrade_Stormsurge:[4646], Upgrade_SwordOfBlossom:[124011], Upgrade_ZzRotPortal:[773512],
  Upgrade_DeathFireGrasp:[773128], Upgrade_InnervatingLocket:[773084] })) {
  rule(name, [], 'Przyspieszam zakup przedmiotu bezpośrednio ulepszanego przez ten augment.', { items, upgrade:true });
}
rule('Upgrade_Immolate', [], 'Immolate generuje złoto. Preferuję jeden z ulepszonych przedmiotów; wybór uwzględnia obrażenia wroga.', { items:[3068,6664], anyItem:true, upgrade:true });
rule('Quest_SteelYourHeart', ['health'], 'Zadanie wymaga Heartsteel i jego ładunków. Przyspieszam ten zakup.', { items:[3084], quest:true });
rule('Quest_WoogletsWitchcap', ['ap'], 'Zdobądź Rabadona i Zhonyę. Po wykryciu kapelusza Woogleta składniki znikną z planu zakupów.', { items:[3089,3157], quest:true, consumed:true });
rule('Quest_VoidImmolation', ['health'], 'Sunfire i Hollow Radiance łączą się w Void Immolation. Wykrycie nagrody kończy plan zakupu składników.', { items:[3068,6664], quest:true, consumed:true });
rule('Quest_UltraHydra', ['ad'], 'Zdobądź Ravenous, Profane i Titanic Hydrę. Po wykryciu Ultra Hydry składniki znikną z planu zakupów.', { items:[3074,6698,3748], quest:true, consumed:true });
rule('FutureSightHeartsteel', ['health'], 'Bonusowe HP odblokowuje darmowy Heartsteel. Nie każę kupować nagrody; po otrzymaniu zaznacz ją w ekwipunku.', { exclude:[3084] });
rule('DoOrDie', ['stackitems'], 'Augment podnosi limity stacków przedmiotów. Dobieram pasujący do postaci item na stacki zamiast kupować wszystkie.');
rule('DontStopCleavin', [], 'Pierwszy Black Cleaver rozpoczyna skalowanie kolejnych kopii. Premiuję go; już posiadane kopie zachowuję.', { items:[773071], repeat:[773071] });
rule('TrueEternity', [], 'Rod of Ages skaluje się bez limitu. Przyspieszam pierwszy egzemplarz i zachowuję kupione kopie.', { items:[773027], repeat:[773027] });
rule('HexCore', [], 'Ulepszaj otrzymany Hex Core. Docelowo rezerwuję miejsce na Perfect Hex Core.', { items:[773516], replace:[773513,773514,773515] });

neutral('Donation|YowchMyCoins|Goldrend', 'Augment zwiększa dostępne złoto. Przyspiesza realizację buildu, ale sam nie wymaga zamiany przedmiotów.');
neutral('TransmuteGold|TransmutePrismatic|TransmuteChaos|PandorasBox', 'Augment losuje nowe augmenty. Po przemianie zaznacz otrzymane wyniki; build automatycznie przeliczy ich rzeczywiste efekty.');
neutral('Stats|StatsOnStats|StatsOnStatsOnStats|OmniSoul', 'Nagroda jest losowa. Sam augment nie określa otrzymanych statystyk, więc zachowuję zakupy championa i odpowiedzi na wrogów.');
neutral('KingMe', 'Ukończ pierwszy przedmiot legendarny i wykonaj warunek augmentu. Otrzymany losowy augment dodaj do wyboru; nie zgaduję jego efektu.');
neutral('WeaponOfDestiny', 'Pierwszy przedmiot legendarny zbiera ulepszenia. Zachowuję bazowy pierwszy zakup oraz zaznaczone posiadane itemy.');
rule('Quest_UrfsChampion', [], 'Zadanie kończą udziały w zabójstwach. Po otrzymaniu Golden Spatula potwierdź ukończenie w edytorze.', {neutral:true,quest:true});
rule('Quest_Sneakerhead', [], 'Augment daje buty i osobny quest. Odczyt Jarvan I’s potwierdza zdobycie nagrody.', { neutral:true, freeBoots:true, quest:true });
neutral('DoransBiggestFan', 'Premia dotyczy startowych itemów Dorana. Ulepszaj posiadany start zgodnie z augmentem; docelowy build legendarny pozostaje bez zmian.');
rule('SpiritOfTheJungleMain', ['jungleitem'], 'Premia wzmacnia przedmioty Spirit w tym wariancie. Dobieram ich wersję do AP, AD lub wytrzymałości postaci.');
neutral('DrinkUp|SummonersSafari|Fruitify', 'Augment daje mikstury, owoce lub inne zasoby. Nie zajmuję nimi miejsc docelowych przedmiotów legendarnych.');
neutral('DipDiveDodge|VeilOfWarding|PatOnTheBack', 'Augment sam zapewnia dodatkową ochronę. Zakupy nadal wynikają z Twojego championa i zagrożeń wroga.');
neutral('MadScientist', 'Efekt zmienia się przy odrodzeniu. Bez informacji o aktualnej formie zachowuję stabilny build championa.');
neutral('Homeguard|LegDay|ShadowRunner|Nightstalking|KillSecured|ShrinkEngine|BrushPower', 'Efekt mobilności, ukrycia lub pozycji działa niezależnie od konkretnego przedmiotu. Nie wymuszam zmiany buildu.');
neutral('BladeWaltz|ClownCollege|YouSpinMeRightRound|GetJinxed|BrassBlast|Totentanz|DimensionShift_Active|Poltergeist', 'Augment daje specjalny czar przywoływacza. Nie utożsamiam jego cooldownu z haste zwykłych umiejętności; zachowuję build championa.');
neutral('Flashy|Flashbang|Flash2', 'Augment zmienia Flash. Nie dobieram haste zwykłych umiejętności pod cooldown czaru przywoływacza.');
neutral('BiggestSnowballEver|SnowballUpgrade|SnowballRoulette|PinballSnowball|GoldenSnowball|Snowbomb|Snowday|SharkTempest', 'Augment ulepsza Śnieżkę. Nie wymaga konkretnego przedmiotu i nie uzasadnia zakupu haste zwykłych umiejętności.');
neutral('DiveBomber|TrainOfTheDead|DropBear|FishBait', 'Efekt uruchamia się po śmierci. Nie przebudowuję zakupów pod celowe umieranie; zachowuję użyteczny build postaci.');
rule('OkBoomerang|Firefox', ['adaptive'], 'Automatyczne obrażenia skalują się z AP i AD. Wzmacniam właściwy typ obrażeń, bez kupowania haste pod timer augmentu.');
neutral('QuantumComputing|DivineIntervention|PromQueen|EndlessDecimation|SquishySlappyGrab', 'Efekt uruchamia się automatycznie. Nie zakładam, że zwykłe haste lub haste itemów skróci jego własny timer.');
neutral('InfernalSoul|HextechSoul|SpiritualPurification|Dropkick|Poro_Blast|Dropybara_Active|PoroKing|InfernoTriggered|Overextender', 'Dodatkowy efekt ofensywny działa bez wymaganego zakupu. Zachowuję główny build i odpowiedzi na skład przeciwników.');
rule('Earthwake|VoidDash', ['spell'], 'Doskoki zostawiają obszar obrażeń. Wspieram cykl umiejętności właściwy dla championa.');

module.exports = rules;
