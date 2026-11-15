# Champ Select Assistant

Asystent wyboru postaci do League of Legends (tylko champion select, nic w trakcie gry).

## Wersja 0.6.15

- Globalny **Ctrl+X** pokazuje aplikację na wierzchu, także gdy działa w tle. Jeśli jej okno jest już aktywne, ten sam skrót chowa je do zasobnika. Przywraca też zminimalizowane okno.
- Prawy przycisk na ikonie obok zegara → **Skrót klawiaturowy** pozwala przełączyć na Ctrl+Shift+X, Ctrl+Alt+X albo wyłączyć skrót. Wybór jest zapamiętywany. Ctrl+X przejmuje standardowe wycinanie, dopóki asystent działa z tym skrótem.
- Gdy skrót jest zajęty, menu pokazuje problem; nieudana zmiana zachowuje dotychczas działający skrót. Zakończenie aplikacji zwalnia skrót w systemie.

## Wersja 0.6.14

- „Dlaczego te zakupy?” wyjaśnia przyspieszenia, źródło rekomendacji oraz przesunięte i pominięte elementy rdzenia. Własne przypięcia mają oddzielne oznaczenie.
- Kółko na przedmiocie przypina go w konkretnym miejscu; „Własne przedmioty i przypięcia” pozwala wybrać inne itemy i buty. Pozostała część buildu nadal się dostosowuje. Niekompatybilne przedmioty są odrzucane. Wybory zapisują się lokalnie w `choices.json` osobno dla championa, roli i trybu.
- Można przypiąć proponowaną stronę run albo zachować stronę z klienta. Wykryta zmiana run w kliencie podczas champion selectu jest zachowywana automatycznie; przycisk „Odblokuj runy” przywraca adaptację. Wykrycie oznacza zmianę strony, także przez inną aplikację; asystent nie rozpoznaje autora zmiany.
- „Tester draftów” w nagłówku pozwala wybrać własną postać, rolę, tryb, czterech sojuszników i pięciu wrogów. Są gotowe scenariusze: kryty, autoataki, tanki z leczeniem. Symulacja używa tego samego silnika, wbudowanej bazy i katalogu gry. Nie importuje niczego do LoL ani nie zmienia zapisanych wyborów dla prawdziwych meczów.
- Tester działa też bez uruchomionego klienta, na dołączonym katalogu statycznych danych Riot. Bez ikon z klienta pokazuje skróty nazw. Rozpoczęcie prawdziwego champion selectu przywraca widok meczu.

## Wersja 0.6.13

- Questy są przypisane do pozycji z klienta, nie klasy championa. Bot planuje 6 przedmiotów i buty w bocznym slocie po queście; także dla maga na bocie. Strzelec na midzie nie dostaje bonusu bota. Przed questem buty zajmują zwykły slot.
- Support ma 4 zakupy, buty i miejsce na przedmiot wsparcia. Control Wardy po queście widać osobno; nie blokują kolejnego slotu w docelowym buildzie.
- Mid pokazuje darmowe ulepszenie butów z danych klienta w uzasadnieniu. Ulepszone T3 z OP.GG są przeliczane na zakup T2, a nie dodatkowy przedmiot. Top i jungle zachowują zwykłą pojemność ekwipunku.
- Eksport do sklepu rozdziela bazową kolejność zakupów oraz „6. item po queście bota”. ARAM, Swiftplay, tryby rotacyjne i brak rozpoznanej roli/kolejki nie dostają bonusowego slotu.
- Widok pokazuje plan po ukończeniu questa, nie jego bieżący postęp w meczu. Zasady: [Riot, patch 26.1](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/); nazwy i dostępność przedmiotów z lokalnego klienta.

## Wersja 0.6.12

- Okno pojawia się raz po wejściu do champion selectu. Odświeżenia danych, picki i chwilowe błędy połączenia nie otwierają go ponownie w tym samym drafcie.
- Krzyżyk chowa aplikację do zasobnika obok zegara. Kliknięcie ikony lub ponowne uruchomienie skrótu pokazuje istniejące okno. Pełne zamknięcie: prawy przycisk na ikonie → „Zakończ”.
- Menu zasobnika pozwala wyłączyć automatyczne pokazywanie oraz włączyć start z Windowsem w tle (`--background`, wersja z instalatorem). Autostart jest domyślnie wyłączony, dopóki użytkownik go nie wybierze.

## Wersja 0.6.11

- Domyślny ekran „Build i plan” pokazuje kolejność zakupów oraz trzy najważniejsze wskazówki bez przewijania w oknie 820×600 lub większym. Runy i statystyki graczy mają osobne zakładki; szczegółowe porady dla drużyny są rozwijane.
- Mocne zagrożenia mogą przyspieszyć przedmiot sytuacyjny przed drugim/trzecim zakupem z OP.GG. Dwa źródła krytów promują Randuin's Omen u tanków; dwie postacie oparte na autoatakach — Frozen Heart; dwaj tankowie — przebicie odpowiednie do klasy. Pierwszy przedmiot bazowy zostaje zachowany. To przewidywanie na podstawie draftu, bez obserwowania ekwipunku przeciwników w trakcie meczu.
- Build pomija przedmioty oznaczone jako niedostępne w danych klienta i na danej mapie, nie łączy wykluczających się ulepszeń Last Whisper/Lifeline, a supportowi zostawia slot na przedmiot wsparcia. Przy leczeniu i tankach Mortal Reminder może obsłużyć obie potrzeby.
- Małe runy i odłamki reagują na poke, krótkie wymiany, CC, wielu tanków oraz leczenie/tarcze własnej postaci. Główna runa pozostaje bazą championa; zmiany są walidowane względem rzędów dostępnych w kliencie i opisane w interfejsie.
- Brak danych o kontrach nie daje premii do blinda. Zakładka maestrii wybiera kandydatów z całej dostępnej puli dla roli przed obcięciem do 10 pozycji. Małe próby statystyczne mają neutralny opis i kolor.
- Komunikat o usuniętym przedmiocie porównuje pełny końcowy build; nie zgłasza usunięcia przedmiotów nadal widocznych na liście.

Test interfejsu: `npm run test:ui` uruchamia ukryte okno Electron z osobnym profilem i danymi symulowanymi, bez dostępu do konta gracza. Zrzuty i raport zapisuje domyślnie w `../ui-preview`; ścieżkę można zmienić przez `UI_OUTPUT`.

## Co robi
- Pokazuje championy Twojej drużyny (z rolami) i przeciwników na żywo, w miarę jak są wybierani.
- Sugeruje 10 picków na Twoją rolę z punktami maestrii z Twojego konta (sortowanie: najlepsze albo maestria). Liczy kontry na widocznych przeciwników, siłę w mecie (tier), synergie z sojusznikami, braki w składzie (AP/AD, frontline, engage) i archetyp obu drużyn. Pomija bany, zajęte i nieposiadane postacie.
- Tryb blind pick: dopóki nie widać przeciwnika z Twojej linii, promuje postacie mocne w mecie i z małą liczbą kontr. Gdy przeciwnik się pojawi, przełącza się na counter pick.
- W fazie banów sugeruje 5 banów: kontry Twojego hovera i picków sojuszników, mocne postacie z Twojej linii. Nigdy nie sugeruje bana postaci, którą hoveruje sojusznik.
- Pokazuje archetyp obu składów (dive, engage, poke, ochrona carry, pick, splitpush) ze wskazówką, jak grać przeciwko wrogowi.
- Importuje runy do klienta jednym kliknięciem (strona „CS Assist: …”; jeśli brak miejsca, nadpisuje aktualnie wybraną stronę).
- Runy, odłamki i czary dopasowuje do meczu i pokazuje, co zmienił i dlaczego: melee przeciw pokującemu dostaje Second Wind (na topie i midzie także Determinację jako drugie drzewko), przeciw all-inowi Kościaną Płytę, przy dużej liczbie CC u wroga odłamek Nieustępliwości. Czary: Bariera na midzie przeciw zabójcy, Podpalenie na wygranym matchupie na topie, Teleport na trudnym, Oczyszczenie dla ADC przy dużej ilości CC, Wyczerpanie dla supporta przeciw zabójcom. Flash i Smite zostają bez zmian.
- Ustawia czary przywoływacza (Flash zostaje na tym klawiszu, na którym go masz).
- Gdy wszyscy zablokują, pokazuje pełny build dopasowany do składu wroga i slotów danej roli po queście, z powodem przy każdym itemie, alternatywami, czarami i kolejnością umiejętności.
- Rozpoznaje konkretne sytuacje w składzie wroga i mówi, czym na nie odpowiedzieć, z nazwami championów: Yasuo i Jhin na krytach → Randuin's Omen, Soraka i Warwick się leczą → antyleczenie, Malzahar ma supresję → Mercurial Scimitar / Banshee's Veil, Zed → Zhonya dla maga, tanki → przebicie, niewidzialni → Control Ward i Oracle Lens (także tarcze, szybkie ataki, burst AP). Dwie najważniejsze odpowiedzi trafiają do buildu (wyróżnione na złoto), reszta do alternatyw; panel „Na co uważać” jest w wyborze postaci i na ekranie ładowania.
- ARAM: rozpoznaje Howling Abyss. Zamiast sugestii picków pokazuje ranking championów z ławki (czy warto się zamienić), czary bez Smite'a i Teleportu (Flash + Śnieżka dla wchodzących w walkę, Heal / Barrier / Exhaust dla reszty), build i runy z OP.GG dla ARAM-u, a na ekranie ładowania plan na ARAM (apteczki, pierwsze walki) i build przeliczony pod skład wroga, którego w wyborze postaci nie widać.
- Auto-build do sklepu (przełącznik w stopce, domyślnie włączony): po zablokowaniu wszystkich build sam trafia do sklepu jako zestaw „CS Assist”. Na ARAM-ie wysyła się po każdej zamianie championa i jeszcze raz na ekranie ładowania, już pod skład wroga.
- Przycisk „Wyślij build do sklepu w grze” zapisuje ten build jako zestaw przedmiotów „CS Assist: …” (start, pierwszy powrót przeciw przeciwnikowi z linii, build w kolejności, bloki „Dlaczego: …” z powodami, alternatywy, wardy). W grze jest w sklepie w zakładce zestawów. Poprzedni zestaw aplikacji jest zastępowany, Twoje własne zestawy zostają.

## Statystyki z OP.GG
Aplikacja pobiera statystyki z oficjalnego, publicznego API OP.GG (serwer MCP `https://mcp-api.op.gg/mcp`, bez klucza):
- tiery i role wszystkich championów (także tych spoza wbudowanych danych),
- kontry (winrate w matchupach, od 1,5 pkt proc. od 50% i min. 100 gier), synergie,
- najpopularniejszy build, buty, runy, czary i kolejność umiejętności.

Pobiera tylko to, co jest potrzebne w danym champ selekcie (Twój champion, widoczni przeciwnicy, aktualne sugestie) i trzyma to w pamięci przez 6 godzin (`opgg-cache.json`). Gdy OP.GG nie odpowiada, aplikacja wraca do wbudowanych danych. Przy sprzecznych danych wygrywa OP.GG.

Statystyki dają bazę. W spokojnym drafcie dwa pierwsze itemy są stałe; przy mocnym zagrożeniu zachowany zostaje pierwszy, a odpowiedź sytuacyjna może wejść wcześniej. Resztę slotów silnik dobiera pod skład wroga (MR, armor, antyleczenie itd.).

Przyciski w stopce: „Wyłącz OP.GG” (tylko własne dane) i „Diagnostyka OP.GG”, która zapisuje surowe odpowiedzi API do `Dokumenty\champ-select-diagnostyka-opgg.json`. Ten plik pozwala dopasować parser, jeśli OP.GG zmieni format.

## Jak build dopasowuje się do składu
Aplikacja liczy profil przeciwników: udział obrażeń AP/AD (tanki i enchanterzy liczą się mniej niż carry), CC, leczenie, tanki, burst i strzelców. Każdy item z puli (`itemPools`) ma tagi, np. `mr`, `armor`, `antiheal`, i dostaje punkty za to, jak odpowiada na te zagrożenia. Pierwszy item championa zostaje, a liczba kolejnych stałych zakupów zależy od zagrożeń. Konkretna odpowiedź (np. antyleczenie) jest zaspokajana raz, podczas gdy ogólne zapotrzebowanie na pancerz/MR słabnie stopniowo. Wybrane przedmioty muszą być ze sobą kompatybilne.

- Na ekranie ładowania pokazuje karty wszystkich 10 graczy (jak Porofessor): Riot ID, rangę z LP i winrate, gry i winrate championem w sezonie, gry championem w ostatnich 30 dniach, KDA, główną rolę oraz rozwijaną listę championów, którymi gra (sezon i ostatnie 30 dni, z liczbą gier, winrate i KDA), i tagi z ostatnich gier (OTP, doświadczony, dużo zgonów, dobra/słaba wizja, wysoki udział w zabójstwach, dobry farm, seria wygranych/porażek, gra poza rolą). Dane z OP.GG, odświeżane co 30 minut.
- Nad kartami pokazuje plan na linię: Twój przeciwnik z linii (jego karta jest wyróżniona), ocenę matchupu i winrate z OP.GG, 3–4 wskazówki (styl przeciwnika, jego statystyki, groźny wczesny jungler) i pierwszy item obronny pod typ jego obrażeń.

W champ selekcie aplikacja nie pokazuje nicków graczy ani ukrytych informacji. Nie automatyzuje picków, banów ani sterowania w grze. Automatyczny import run i zestawu przedmiotów można wyłączyć w ustawieniach.

## Uruchomienie
- Najprościej: `ChampSelectAssistant-portable.exe` (bez instalacji). Windows może pokazać ostrzeżenie SmartScreen, bo plik nie jest podpisany: „Więcej informacji” → „Uruchom mimo to”.
- Ze źródeł: zainstaluj Node.js 20+, potem `npm install` i `npm start`.

Aplikacja sama znajduje uruchomionego klienta LoL (przez proces `LeagueClientUx.exe` albo plik `lockfile`).

## Dane (runy, buildy, kontry)
Plik `champions.json` (przycisk „Edytuj dane” otwiera jego folder w `%APPDATA%`). Zawiera ok. 65 popularnych championów; reszta dostaje szacunkowy build po klasie.
- `roles`: top / jungle / middle / bottom / support
- `counters` / `weakVs`: aliasy championów (jak w kliencie, np. `MonkeyKing`, `JarvanIV`)
- `runes`: nazwa presetu z `runePresets` albo własna strona `{ p, s, perks: [6 id], shards: [3 id] }`
- `items` (pierwsze 2 są stałe), `boots`, `spells`, `skills`, opcjonalnie `starters` (itemy startowe)
- `starters`: itemy startowe dla klas i junglerów, `earlyDefense`: pierwszy item obronny przeciw AP/AD, `trinkets`, `consumables`: do zestawu w sklepie
- `meta.tiers`: siła w mecie (S/A/B/C), `synergies`: pary championów grające dobrze razem
- `itemPools`: itemy sytuacyjne dla klas z tagami zagrożeń (konkretne sytuacje, np. kryty czy supresja, są w `src/situational.js`), `championTraits`: cechy pozostałych championów (AP, tank, leczenie, CC, burst)
Id run/itemów są sprawdzane z danymi klienta, więc po zmianie patcha błędne pozycje zostaną zastąpione lub pominięte. Po edycji kliknij „Wczytaj dane ponownie”.

## Testy bez gry
```
npm test                 # testy logiki na symulowanym kliencie
npm run test:ui          # interfejs i przypięcia w testerze draftów
npm run test:desktop     # cykl okna oraz ochrona run na symulowanym LCU
npm run test:offline     # tester bez klienta i izolacja od własnych ustawień
npm run test:mayhem      # augmenty, zakupy, IPC, izolacja testera i reset meczu
npm run mock             # symulowany klient na porcie 2999
node mock/mock-opgg.js   # symulowany OP.GG na porcie 3999
set LCU_MOCK=http://127.0.0.1:2999 && set OPGG_ENDPOINT=http://127.0.0.1:3999/mcp && npm start
```
Kroki scenariusza w symulatorze: `http://127.0.0.1:2999/__step?n=0` … `n=3`.

## ARAM: Mayhem (od 0.6.16)
- Osobne wykrywanie `KIWI` i `KIWI_JADE`; zwykły ARAM pozostaje osobnym trybem. Runy i ich import są wyłączone w Mayhem, a Exhaust nie jest sugerowany.
- Po rozpoczęciu meczu przycisk **Augmenty i ekwipunek** otwiera wyszukiwarkę nazw polskich i angielskich. Możesz wybrać do 5 augmentów, zaznaczyć ukończenie zadania i podać kupione przedmioty oraz buty. Otwórz asystenta swoim skrótem (domyślnie Ctrl+X).
- Zmiana augmentu od razu przelicza dalsze zakupy z uwzględnieniem składu wroga. Posiadane przedmioty zostają w buildzie. Aplikacja pokazuje następny zakup i uzasadnienie zmian. Questy itemowe mają osobną obsługę składników oraz ukończenia.
- Od **0.6.17 każdy z 283 augmentów** katalogu ma jawną, automatyczną regułę (241 w KIWI, 188 w KIWI_JADE; część wspólna). Wybierasz nazwę augmentu, bez przypisywania efektu. Dla KIWI 191 reguł może zmieniać priorytety przedmiotów, a 50 objaśnia brak wymuszonej zmiany zakupów — np. złoto, losowa nagroda czy zmiana Flasha. Opcjonalne własne korekty są schowane w szczegółach. To heurystyki synergii, bez deklarowania winrate lub optymalnego buildu dla każdej kombinacji.
- Reguły uwzględniają m.in. krytyczne czary, on-hit, AP/AD, manę, leczenie, odporności, ruch, spowolnienia, ulepszenia itemów i questy. Sprzeczne mechaniki są rozstrzygane razem: Back To Basics wyłącza zakupy pod R, Vampirism wyklucza Warmoga, a konwersja HP nie jest traktowana jako dodatkowa obrona.
- Posiadane automatyczne ulepszenia i nagrody (np. Seraph, Jarvan I's) pozostają w ekwipunku. Reguły rozróżniają darmowy Heartsteel, buty z questu, ulepszanie Hex Core i kopie przedmiotów dopuszczone przez odpowiedni augment. Kolejne kopie konkurują z odpowiedziami na przeciwników; planner nie zapełnia automatycznie całego buildu jednym itemem.
- Augmenty, ukończenie questów i ekwipunek zaznaczasz ręcznie. Aplikacja nie odczytuje ich automatycznie z gry. Dane zapisuje lokalnie dla danego meczu i championa, odtwarza po restarcie oraz resetuje w następnym meczu. Po sprzedaży lub połączeniu itemów zaktualizuj listę posiadanych.
- Build w aplikacji aktualizuje się od razu. Zapis zestawu do klienta po zmianie augmentów uruchamia osobny przycisk; klient może nie odświeżyć już otwartego sklepu w trakcie meczu.
- Mayhem jest również dostępny w **Testerze draftów**. Symulacja nie zmienia wyborów trwającego meczu.
- ARAM i Mayhem nie pokazują porad o linii, jungli i wardach ani statystyk/rang graczy z soloQ. Mayhem skupia główny ekran na buildzie i augmentach; zwykły ARAM zachowuje porady o walkach drużynowych.

Źródła: [zasady Riot](https://support.riotgames.com/en-us/league-of-legends/events/league-of-legends-aram-mayhem-game-mode), dane gry udostępnione przez [CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/augment-lists.json). Katalog można odświeżyć poleceniem `node scripts/update-mayhem-catalog.js`. Jawne reguły są w `src/mayhem-rules.js`, ich wykonanie w `src/mayhem.js`, a identyfikatory i hashe sprawdzonych opisów patcha 16.22 w `data/mayhem-rule-evidence.json`. Zmiana patcha wymaga przeglądu reguł; test pokrycia blokuje wydanie katalogu z nieobsłużonym augmentem. Testy sprawdzają także każdy augment na sześciu klasach postaci oraz konkretne kombinacje i ograniczenia przedmiotów.

## Aktualizacje
- Wersja z instalatorem (`ChampSelectAssistant-Setup-x.y.z.exe`) aktualizuje się sama: pobiera nową wersję w tle, a w górnym pasku pojawia się „Wersja x.y.z pobrana · Uruchom ponownie”. Bez kliknięcia zainstaluje się przy zamknięciu aplikacji.
- Wersja przenośna (`ChampSelectAssistant-portable.exe`) nie może podmienić sama siebie, więc pokazuje „Dostępna wersja x.y.z · Pobierz” i otwiera stronę wydania.
- Aplikacja sprawdza aktualizacje przy starcie i co 6 godzin, w [wydaniach na GitHubie](https://github.com/kardapan-alt/champ-select-assistant/releases).

## Wydawanie nowej wersji
Każdą aktualizację aplikacji publikuj także jako GitHub Release, żeby zadziałał automatyczny updater. Podnieś `version` w `package.json` i lockfile, przetestuj zmiany, wypchnij `main` oraz odpowiadający wersji tag `v*`. GitHub Actions (`.github/workflows/release.yml`) uruchomi testy, zbuduje instalator i wersję portable na Windowsie i opublikuje wydanie. Przed zakończeniem sprawdź powodzenie workflow oraz obecność instalatora, pliku blockmap i `latest.yml` w publicznym wydaniu.

## Budowanie exe
`npm run dist` → folder `dist/`.
