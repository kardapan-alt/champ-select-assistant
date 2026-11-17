# Champ Select Assistant

Asystent wyboru postaci i buildu do League of Legends, z obsługą ARAM: Mayhem w trakcie meczu.

## Wersja 0.6.32

- Uzupełniona baza wszystkich 173 championów: osobne rdzenie i późniejsze zakupy dla Summoner’s Rift oraz ARAM, na podstawie publicznych danych OP.GG z patcha 16.22. Mayhem korzysta z bazy ARAM przed dopasowaniem do augmentów.
- Naprawione odczyty buildów: komponenty nie wypychają trzeciego gotowego przedmiotu; Muramana, Seraph’s Embrace, Fimbulwinter i Diadem wskazują właściwy przedmiot do kupienia. Warianty Jade nie przejmują ról zwykłych championów.
- Późniejsze zakupy respektują wybrany styl AP/AD, kryty, on-hit i wsparcie. Zwykła zmiana roli nie zastępuje własnego rdzenia zestawem innej postaci. IE pozostaje w bazowych buildach pod kryty, a postacie bez many nie dostają przypadkowych ofensywnych przedmiotów many.
- Rozszerzony filtr wspólnego Spellblade, również dla Dusk and Dawn i Essence Reaver. Kupione i przypięte przedmioty nadal mają pierwszeństwo.
- Widoczne źródło, patch i data zapisanej bazy. Nieaktualny format pamięci analiz jest odrzucany; stara baza lokalna ma kopię zapasową przed migracją. Ustawienia aplikacji i własne przypięcia pozostają zachowane.

Walidacja: 237 testów logiki, w tym 2076 zestawów bez augmentów (173 postacie × 3 tryby × 4 składy przeciwników), warianty klienta, parser OP.GG, konwersje, zasoby i dotychczasowa macierz 5094 kombinacji augmentów. Pełny test aplikacji obejmuje zakupy, migrację bazy i prezentację źródła. Testy sprawdzają spójność rekomendacji; nie są pomiarem winrate ani gwarancją najlepszego buildu w każdym meczu.

Zapisane buildy ARAM nie są statystykami Mayhem. Prośby, liczby gier i hashe odpowiedzi źródłowych opisano w data/base-build-evidence.json; odświeżanie bazy dokumentuje scripts/import-base-builds.js.

Po pobraniu aktualizacji wybierz „Uruchom ponownie”. Krzyżyk tylko ukrywa okno. Sprawdzanie wydań odbywa się przy starcie i co 6 godzin.

## Wersja 0.6.31

- Rozdzielone premie do zwykłych ataków od rzeczywistego nakładania on-hit przez umiejętności. Deft, zasięg, Bonk, Mercy’s Strike, Divine Domain i efekty uruchamiane zarówno czarami, jak i atakami nie wymuszają już przypadkowego kompletu Nashor/Guinsoo/Spellblade.
- Reguły uwzględniają rolę i obecny kierunek zakupów. Tank z obrażeniami magicznymi dostaje obronę i haste, wojownik AP zachowuje AP, a enchanter przedmioty wsparcia. Sama premia AP lub AD nie jest traktowana jak konwersja całego buildu.
- Dane o zasobach 173 championów z Riot Data Dragon ograniczają ofensywne zakupy many na postaciach bez many. Zachowane są wyjątki dla konwersji many w AP, jawnych zadań/ulepszeń i już kupionych przedmiotów. Frozen Heart nadal może być odpowiedzią obronną.
- Kilka augmentów wzmacniających ten sam ogólny efekt nie mnoży już premii do kolejnych wariantów przedmiotu. Kupiony, przypięty lub zarezerwowany item zaspokaja tę wspólną potrzebę, pozostawiając miejsce na rdzeń championa i odpowiedzi na wrogów.
- Prawdziwe konwersje AP/AD, Marksmage, nakładanie on-hit przez czary, kryty umiejętności i bezpośrednie ulepszenia przedmiotów nadal mają osobne reguły. Zachowane są poprawki IE u strzelców oraz Crimson Cobalt na Zedzie.

Walidacja: 229 testów logiki, w tym cały katalog 283 augmentów na 18 profilach (5094 kombinacje), dodatkowe przypadki regresji oraz pełny przepływ zakupów w aplikacji. Macierz sprawdza spójność rekomendacji, zasoby i zgodność przedmiotów; nie jest pomiarem winrate ani gwarancją optymalności każdego zestawu w meczu.

Opisy mechanik zweryfikowano z danymi gry dla patcha 16.22, wskazanymi w data/mayhem-rule-evidence.json. Ta aktualizacja dotyczy rekomendacji zakupów; nie zmienia odczytu OCR.

Po pobraniu aktualizacji wybierz „Uruchom ponownie”. Krzyżyk tylko ukrywa okno. Sprawdzanie wydań odbywa się przy starcie i co 6 godzin.

## Wersja 0.6.30

- Poprawiony wpływ augmentów na build: podstawowe przedmioty championa zachowują większą wagę, a kolejne zakupy pod ten sam ogólny efekt dostają znacznie mniejszą premię. Drobna synergia nie oznacza już automatycznie „WCZEŚNIEJ”.
- Szkarłatny Kobalt (Crimson Cobalt) ma osobną regułę. Wzmacnia cykl Q → atak bez wymuszania całego buildu on-hit lub Spellblade. Zed zachowuje AD/przebicie i kupione przedmioty.
- Ogólne skalowanie korzysta z własnego rdzenia championa. Bezpośrednie ulepszenia przedmiotów i zadania nadal dostają priorytet; jawne konwersje AP/AD, ataków, HP lub many mogą przebudować zestaw.
- Automatyczne rekomendacje nie łączą kilku różnych przedmiotów Spellblade. Filtr nie usuwa już kupionych ani ręcznie przypiętych przedmiotów.
- Shake Proteinowy priorytetyzuje przedmioty dające odporności; Redemption nie otrzymuje premii za statystyki odporności, których nie dostarcza.

Walidacja: 223 testy, w tym 283 augmenty × 6 klas, zachowanie rdzenia, Spellblade, ulepszenia przedmiotów, konwersje oraz wcześniejsze regresje Gragasa i Xayah. Przeszły testy całego przepływu zakupów i OCR. Poprawiony build sprawdzono też na bieżącym meczu Zeda z kupionym Hubris.

Dostarczony zrzut z Upgrade Sundered Sky / Crimson Cobalt / Nightstalking jest prawidłowo rozpoznawany w 1440p, 1080p, 720p i ultrawide. W zapisie rzeczywistego meczu potwierdzono automatyczny wybór Crimson Cobalt. To potwierdzenie konkretnego przypadku, nie gwarancja odczytu każdego ekranu. Zrzut użytkownika nie jest dołączony do repozytorium ani instalatora.

Po pobraniu aktualizacji wybierz „Uruchom ponownie”. Krzyżyk tylko ukrywa okno. Sprawdzanie wydań odbywa się przy starcie i co 6 godzin.

## Wersja 0.6.29

- Infinity Edge pozostaje w planie strzelca AD po zakupie co najmniej dwóch gotowych przedmiotów pod kryty. Odpowiedzi na zakupy przeciwników nie wypychają go już z całego zestawu. Kupione i przypięte przedmioty zachowują pierwszeństwo; reguła respektuje konwersję AP/AD i wykluczenia augmentów.
- Poprawka odtworzona na danych meczu Xayah: Yun Tal + Navori + Mortal Reminder → Infinity Edge jako następny zakup, zamiast zestawu kończącego się wyłącznie BotRK i Maw.
- Zawiera poprawki 0.6.28: build AP Gragasa, oceny dopasowania augmentów S–F i obsługę 13 ulepszeń przedmiotów.

Automatyczny zapis augmentów nadal nie działa poprawnie w zgłoszonym meczu użytkownika. Odbiór obrazu i praca OCR zostały potwierdzone, ale przyczyna braku rozpoznania wyboru pozostaje do ustalenia. Ta wersja nie deklaruje naprawy tego problemu. Augmenty można uzupełnić w „Augmenty i ekwipunek”; zapisane augmenty otrzymują oceny dopasowania i wpływają na build.

Walidacja: 220 testów logiki, w tym Xayah w ARAM, Mayhem i klasycznym trybie, zachowanie zakupów/przypięć i konwersji AP. Build sprawdzono również na faktycznych zakupach bieżącego meczu.

Po pobraniu aktualizacji wybierz „Uruchom ponownie”. Krzyżyk tylko ukrywa okno. Sprawdzanie wydań odbywa się przy starcie i co 6 godzin.

## Wersja 0.6.28

- Gragas oraz inni wojownicy i zabójcy AP bez gotowego buildu korzystają z szablonu AP. Rola postaci nie podmienia go na rdzeń AD. Kupione i przypięte przedmioty oraz świadoma konwersja AP/AD z augmentu pozostają zachowane.
- Oceny S–F pod oferowanymi i zapisanymi augmentami, z uzasadnieniem dopasowania do postaci, przedmiotów i synergii. To ocena regułowa dla bieżącego buildu, nie globalna tierlista ani winrate. „—” oznacza brak podstaw do oceny.
- Wszystkie 13 ulepszeń przedmiotów z katalogu mają jawnie wskazany cel zakupu i status: w buildzie, kupiony albo poza planem. Stormsurge jest przyspieszany po zapisaniu jego augmentu. Sheen oraz Immolate wybierają jeden odpowiedni wariant.
- OCR lepiej obsługuje wolniejsze odczyty i nie myli pojedynczej krawędzi mapy ze stale otwartą kartą. Statusy rozdzielają brak obrazu, czytanie nazw, potwierdzanie kart i zapis wyboru. Headliner nie jest wymagany do odczytu augmentów.
- Lokalne augment-diagnostics.json zawiera czas i etap odczytu, rozmiar obrazu oraz identyfikatory rozpoznanych augmentów. Nie zawiera zdjęć, pełnego tekstu OCR ani nazw kont.

Walidacja: 218 testów logiki; rzeczywisty Windows OCR na kartach testowych, w tym wybór Stormsurge → zapis → build i ocena; publiczne zdjęcie kart w 720p, 1080p i ultrawide. Pełny odczyt wyboru w meczu użytkownika nie został jeszcze potwierdzony. Wcześniej pominięte wybory wymagają uzupełnienia w „Augmenty i ekwipunek”.

Po pobraniu aktualizacji wybierz „Uruchom ponownie”. Krzyżyk tylko ukrywa okno. Sprawdzanie wydań odbywa się przy starcie i co 6 godzin.

## Wersja 0.6.27

- **Naprawiony odczyt zakupów przeciwników:** Live Client może zwracać nazwę postaci jako `Character_Aatrox_Name` zamiast `game_character_displayname_Aatrox`. Oba dokładne formaty są teraz obsługiwane dla własnej postaci i przeciwników, nadal z weryfikacją konta, drużyny i championa. Ten wariant nazwy nie wyłącza już analizy całej drużyny wroga.
- **Randuin przeciw rzeczywistym buildom pod kryty:** zweryfikowano przypadek Trundle’a przeciw Ezrealowi, Aatroxowi i Xayah z przedmiotami krytycznymi. Po przywróceniu odczytu istniejąca reguła wskazuje Randuin’s Omen jako następny zakup, zachowując kupione itemy. Sprawdzono również wariant po pierwszym przedmiocie, w ARAM i Mayhem.
- Zawiera wszystkie zmiany 0.6.26: odczyt okna gry, karty graczy, przypięcie zakupu, mały widok i informacje o danych.

Walidacja: 208 testów logiki, test pełnego przepływu zakupów przez aplikację oraz odczyt i przeliczenie faktycznych danych trwającego meczu. To nie jest automatyczny zakup w grze.

## Wersja 0.6.26

- **Naprawiony odczyt okna gry:** Windows może zwracać pustą ścieżkę chronionego procesu LoL, mimo dostępnego okna. Asystent rozpoznaje teraz dokładny proces i tytuł okna także w takim przypadku; nadal przechwytuje wyłącznie to okno. Błąd przechwytywania ma konkretny komunikat i automatyczne ponowienie, zamiast ciągłego „Czekam na obraz”. Rozpoznawanie rozpoczyna się od kolejnych widocznych kart; pominięte wcześniejsze wybory można uzupełnić w edytorze.
- **Gracze i statystyki:** przywrócone karty obu drużyn również w ARAM/Mayhem, po pięć kart w rzędzie w szerokim oknie. Ranga, statystyki championa i historia pochodzą z profilu OP.GG; aplikacja wyraźnie oznacza, że mogą dotyczyć innych trybów. Porady o linii, wizji i ocenianie roli pozostają wyłączone w ARAM/Mayhem. Przełącznik statystyk działa również podczas meczu.
- **Przypięcie następnego zakupu:** wybierz „Zbieram na” pod buildem lub przy porównaniu zakupów. Cel jest zapisany dla bieżącego meczu, postaci i konta, również po ponownym otwarciu aplikacji. Nie zmienia stałych przypięć. Nowe zakupy wroga pokazują alternatywę z uzasadnieniem; nie podmieniają celu. „Odblokuj” przywraca automatyczny plan. Odczyt posiadanego przedmiotu kończy cel; zmiana augmentów lub ograniczeń może go zwolnić z wyjaśnieniem.
- **Kompaktowy widok pod Ctrl+X:** małe okno pokazuje zakup, złoto, przypięty cel, alternatywę, jedną poradę i status odczytu. Kolejne naciśnięcie chowa aktywne małe okno. „Pełny widok” przywraca poprzedni rozmiar. Otwieranie z zasobnika i popup przy champion select nadal pokazują pełny widok. Nie dodano nakładki do procesu gry ani automatycznych zakupów.
- **Aktualność danych:** przycisk „Dane” pokazuje wersję gry odczytaną z lokalnego klienta, źródła i daty katalogów oraz osobną zgodność patcha reguł augmentów i tabeli map. Brak numeru patcha jest oznaczony jako niepotwierdzony; data pobrania nie staje się datą walidacji reguł. Nowy patch klienta wobec starszych danych jest sygnalizowany. Reguły wbudowane aktualizują się z wydaniem aplikacji.

Walidacja: 206 testów logiki, przepływ przypięcie → zmiana zakupów wroga → mały widok → odblokowanie → zakup → reset meczu, pobranie 10 profili w ARAM i Mayhem, testy pulpitu i Windows OCR. Na rzeczywistym oknie trwającej gry potwierdzono wykrycie źródła i odbiór niepustego obrazu 2560×1440. Rozpoznanie i zapis wybranego augmentu sprawdzono rzeczywistym OCR na symulowanych kartach, wraz z błędem przechwytywania i powrotem odczytu; pełny wybór w rzeczywistym Mayhem pozostaje do potwierdzenia.

## Wersja 0.6.25

- **Status odczytu nad zakupami:** osobno ekwipunek i złoto, zakupy wrogów, zapisane augmenty oraz Headliner. Czas ostatniego odczytu rośnie również bez nowych danych. Po sześciu sekundach bez potwierdzonego ekwipunku widok ukrywa zakup za stare złoto. Brak złota, nieznane przedmioty i augmenty bez reguł są oznaczane osobno.
- **Dlaczego zmienił się build:** pod kolejnością przedmiotów pojawia się ostatnia faktyczna zmiana, jej powód i rozwijane porównanie przed/po z konkretnymi zakupami wroga. Samo przybywanie złota nie tworzy komunikatów. Pierwszy odczyt ustala punkt odniesienia; przerwa w połączeniu nie jest traktowana jako sprzedaż. Porównanie dotyczy potwierdzonych danych jednego meczu i resetuje się w następnym meczu lub po ponownym uruchomieniu aplikacji.
- Liczba zapisanych augmentów nie jest deklaracją kompletności rozpoznania. Wstrzymany albo nieaktualny OCR jest widoczny obok tej liczby; ustalony wcześniej Headliner pozostaje zapisany.

Walidacja: 194 testy logiki, pełny przepływ z niezależną przerwą odczytu przeciwników, widoki 820 i 1100 px oraz rzeczywisty Windows OCR na symulowanych komunikatach. Klient był poza meczem; test OCR w rzeczywistym Mayhem pozostaje do wykonania.

## Wersja 0.6.24

- **Automatyczny Headliner z obrazu gry:** istniejący OCR odczytuje nazwę wraz z właściwym opisem wydarzenia w centralnej części okna gry. Wymagane są trzy zgodne odczyty. Obsługiwane są polskie i angielskie komunikaty dziewięciu Headlinerów, w tym Superfans. Sama nazwa przedmiotu/skina, nazwa bez opisu lub niejednoznaczny zestaw nie wystarczają.
- Nie wymaga najeżdżania ani kalibracji. Działa, gdy w grze widać czytelny komunikat wydarzenia i włączony jest **automatyczny OCR**. Pominięty lub nieczytelny komunikat pozostawia Headlinera nieustalonego. Funkcja jest eksperymentalna. Wzmacniane Q/W/E/R Pentakill i dodatkowe modyfikatory HEARTSTEEL nie są rozpoznawane automatycznie.
- **Ręczna korekta ma pierwszeństwo.** W „Augmenty i ekwipunek” ręczny wybór wyłącza odczyt Headlinera w bieżącym meczu. Zaznaczenie automatycznego wykrywania rozpoczyna nowy odczyt. Formularz otwarty przed automatycznym wykryciem nie kasuje nowego Headlinera przy zmianie samych augmentów. Ustawienie i rozpoznanie dotyczą tylko bieżącego meczu.
- **Automatyczny wynik:** komunikat GameEnd z Live Client lub wynik konkretnego meczu z klienta LoL. Po opóźnieniu danych aplikacja ponawia odczyt i sprawdza historię tego samego meczu. Numer meczu, własny gracz i champion są weryfikowani; brak danych nigdy nie oznacza porażki. Wynik pojawia się także w już otwartym podsumowaniu. Można go ręcznie skorygować albo wrócić do ustawienia „Automatycznie z gry”.
- Nowe zapisy historii zawierają numer meczu, championa i skrót identyfikatora właściciela do kontroli zgodności konta. Nie zapisują surowego PUUID ani nazw kont innych graczy. Stare zapisy bez tych danych zachowują opcję ręcznego wyniku.

Teksty OCR pochodzą z danych gry publikowanych przez CommunityDragon: dokładne źródła i data znajdują się w `data/headliner-texts.json`. Nie pobieramy ich ani nie wysyłamy obrazów w czasie meczu. Wyniki wykorzystują `/liveclientdata/allgamedata`, `/lol-end-of-game/v1/eog-stats-block` oraz `/lol-match-history/v1/games/{gameId}`. Zasady Riot i brak deklaracji zatwierdzenia pozostają opisane przyciskiem w aplikacji.

Walidacja: 186 testów logiki, testy Mayhem, test pełnego przepływu z opóźnionym wynikiem oraz prawdziwy OCR Windows na symulowanych komunikatach Headlinerów i kart augmentów. Format danych wyniku zweryfikowano również na historii meczu dostępnej w lokalnym kliencie. Automatycznego Headlinera nie testowano jeszcze podczas rzeczywistego meczu.

## Wersja 0.6.23

- **Porównanie zakupów:** bieżący plan, wcześniejszy zakup późniejszego itemu i sytuacyjna alternatywa. Każda ścieżka ma osobno policzone komponenty, dostępne złoto, wolne sloty, uzasadnienie i koszt odłożenia obecnego celu. Rozwinięcie „Porównaj ścieżki zakupów” nie zmienia przypiętych wyborów.
- **Synergie augmentów:** porównanie rozdziela dopasowanie do postaci, posiadanych i planowanych itemów oraz potwierdzone interakcje par. Uwzględnia m.in. HP z Heavy Hitter/Pressure Cooker, DoT z Vulnerability, leczenie z Circle of Death i haste z One Hit Wonder. Ręczna korekta efektów lub kolidująca konwersja wyłącza odpowiednią automatyczną regułę pary. To ocena dopasowania, nie winrate ani symulacja DPS.
- **Headliner wybierany ręcznie** w „Augmenty i ekwipunek”, również w testerze: K/DA, HEARTSTEEL, True Damage, Pentakill, Disco, Cafe Cuties, Bees, Command Line oraz „Inny / nowy”. Pentakill pozwala zapisać wzmacniane Q/W/E/R i ostrzega o konflikcie R z Back To Basics. HEARTSTEEL wyraźnie oznacza brak oceny dodatkowego modyfikatora. Dodatkowe augmenty nie są blokowane po piątym wyborze; limit 12 wpisów jest zabezpieczeniem magazynu danych, nie deklaracją limitu gry. Brakujące wartości bonusów nie są zgadywane.
- **Po meczu:** lokalnie zapisane ostatnie 10 meczów z historią zmian ekwipunku, augmentów, Headlinera i celu zakupów. Zapis rozpoczyna się od pierwszego poprawnego odczytu, oznacza przerwy, przetrwa restart i nie zawiera nazw kont przeciwników. Historia do 200 zdarzeń na mecz; starsze są oznaczane jako pominięte. Wynik oraz ocenę przydatności porad wpisujesz samodzielnie. Zmiana ekwipunku nie jest automatycznie nazywana zakupem (może być nagrodą lub połączeniem części).
- **Informacja o Riot** jest dostępna przyciskiem w nagłówku: wymagany tekst o braku poparcia Riot, odnośnik do zasad oraz brak deklaracji zatwierdzenia tej aplikacji. Nie jest to certyfikat zgodności ani gwarancja braku sankcji.

Mechaniki Headlinerów: [Riot 26.21](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-21-notes/) i [26.22](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-22-notes/). [Riot General Policies](https://support-developer.riotgames.com/hc/en-us/articles/22698591841939-General-Policies) wymagają rejestracji i oceny produktu oraz nowych funkcji w Developer Portal. Ta aktualizacja nie rejestruje produktu i nie przesądza akceptacji OCR/rozpoznawania kliknięć przez Riot.

Weryfikacja: `npm test`, `npm run test:shop` (pełny przepływ zakupy → edytor Headlinera → sześć augmentów → podsumowanie → zapis oceny, symulowane mecze), testy Mayhem, OCR ofert i interfejsu. Brak testu nowych funkcji w rzeczywistym meczu.

## Wersja 0.6.22

- **Build reagujący na zakupy przeciwników** w Mayhem, ARAM i na Summoner’s Rift. Gotowe itemy z pancerzem przyspieszają przebicie dla AD, odporność magiczna — dla AP, kryty — Randuina na frontlinie, szybkość ataku — Frozen Heart. Jest też odpowiedź na zdrowie i kradzież życia. Reguły dobierają przedmiot do klasy postaci i respektują augmenty, wykluczające się rodziny itemów oraz własne przypięcia. Kupione przedmioty zostają w planie.
- Reakcja wymaga dwóch pasujących gotowych zakupów u jednego wroga; dla odporności i zdrowia rozłożonych po drużynie — co najmniej trzech. Sam drobny komponent nie wypiera rdzenia. Komunikat pod zakupem podaje przyczynę, a najechanie pokazuje konkretne odczytane itemy. To reguły na podstawie zakupów, nie pomiar rzeczywistych statystyk przeciwnika.
- **Kup teraz** pokazuje aktualne złoto, dostępny zakup lub komponent kolejnego przedmiotu i pozostałe złoto. Odejmowane są posiadane części receptury, z osobnym liczeniem identycznych sztuk. Gdy nic nie mieści się w budżecie, widać ile brakuje. Pełny ekwipunek pozwala łączyć komponenty, ale nie obiecuje siódmego zwykłego slotu; boczne buty ADC muszą być potwierdzone w odczycie. Przedmioty wymagające specjalnej waluty/odblokowania nie dostają zwykłej ceny zakupu.
- Panel zakupów i cały build są nad augmentami, również w wąskim oknie. To podpowiedź do ręcznego użycia, gdy sklep jest dostępny — aplikacja nie wykonuje zakupów ani nie zakłada, że możesz kupować w danym miejscu mapy.
- Złoto i ekwipunki pochodzą z jednego odczytu lokalnego `/liveclientdata/allgamedata`, odświeżanego co około 2 sekundy. Tożsamość gracza, postać, tryb i drużyny są weryfikowane. Przy braku świeżych danych „Kup teraz” przestaje polecać zakup, a build wraca do informacji o składzie. Ostatnie własne itemy pozostają zachowane. Ten odczyt nie zapisuje złota, ekwipunków wrogów ani ich nazw kont na dysku. W ręcznym trybie ekwipunku Mayhem wycena jest wyłączona.

Weryfikacja: `npm test`, `npm run test:shop`, `npm run test:mayhem`, `npm run test:ui`, `npm run test:offers`. Test zakupów obejmuje pełny przepływ lokalnego odczytu przez główny proces do interfejsu, zmianę złota, zakup, sprzedaż wroga, brak połączenia, opóźnioną odpowiedź ze starego meczu, wszystkie trzy tryby i okna 1100/820 px. Mecze są symulowane; test augmentów używa prawdziwego OCR Windows.

## Wersja 0.6.21

- **Porównanie trzech oferowanych augmentów.** Po dwóch zgodnych odczytach kart pojawia się zestawienie w kolejności lewej, środkowej i prawej karty. Ocena uwzględnia profil postaci, kupione i zaplanowane przedmioty, wspólne zakupy z już wybranymi augmentami, konflikty mechanik oraz przedmioty potrzebne do questów. **Dlaczego?** rozwija uzasadnienie i warunki działania.
- Wyróżnienie **Najwięcej synergii** pojawia się przy wyraźnej przewadze dopasowania bez wykrytych zastrzeżeń. Remisy nie mają wymuszonego zwycięzcy. Jest to porównanie dopasowania do obecnego buildu, bez statystycznego rankingu siły i winrate’ów. Augmenty niezależne od zakupów otrzymują osobną informację; brak premii za synergię nie oznacza, że są słabe. Porównanie samo nie wybiera augmentu i nie zmienia buildu.
- Otwórz asystenta przez **Ctrl+X**, aby obejrzeć karty i powody. Podczas przeglądania aplikacja pokazuje oznaczony ostatni odczyt przez maksymalnie 30 sekund. Powrót do gry odświeża dane; przerzut, wybór, nieczytelny obraz, wyłączenie odczytu i zakończenie meczu usuwają nieaktualne porównanie.
- **Cofnij odczyt: [nazwa]** usuwa ostatni augment dopisany automatycznie przez asystenta. Ekwipunek i pozostałe wybory zostają. Historia obejmuje do pięciu nowych rozpoznań i jest zapisywana dla tego meczu, także po restarcie. Cofnięty odczyt nie dopisze się sam ponownie; można świadomie przywrócić augment przez **Augmenty i ekwipunek**.
- Cofanie poprawia zapis w asystencie, a nie wybór dokonany w LoL-u. Ręczne wybory nie otrzymują przycisku cofania odczytu. Stary przycisk nie cofa nowszego rozpoznania, a formularz otwarty przed cofnięciem prosi o ponowne otwarcie. Nowy mecz resetuje historię oraz wyjątki. Historia cofania zaczyna się od rozpoznań wykonanych w 0.6.21.

Weryfikacja: `npm test` obejmuje porównanie ról, własne przedmioty, questy, konflikty, remisy, cały katalog obu pul, cofanie, ponowne odczyty i zapis po restarcie. `npm run test:offers` sprawdza prawdziwy OCR Windows w symulowanym meczu, renderer porównania, cofanie przyciskiem, stary formularz, przerzut, zatrzymany podgląd po zmianie aktywnego okna i izolację kolejnego meczu. Źródło obrazu oraz wejście myszy są w tym teście symulowane.

## Wersja 0.6.20

- **Automatyczne rozpoznawanie wybranego augmentu bez Overwolfa, najeżdżania i kalibracji (eksperymentalne).** W meczu Mayhem asystent odczytuje polskie/angielskie nazwy trzech kart, odnajduje ich ramki i rozpoznaje klikniętą kartę. Dopisuje augment i przelicza build dopiero po zniknięciu kart na dwóch czytelnych obrazach. Zwykle zajmuje to około 1–2 sekund po kliknięciu; wolniejszy komputer może potrzebować więcej czasu.
- Tryb uruchamia się automatycznie z meczem. Przycisk **Wyłącz/Włącz** steruje odczytem; wcześniejsze świadome wyłączenie jest zachowane. Stara kalibracja nie jest wymagana. Obszar odczytu, kontrast i skala dopasowują się do obrazu, również na monitorze ultrawide.
- Samo najechanie, przerzut pod kartą, przeciągnięcie między kartami, Escape, Alt-Tab i czarny obraz nie potwierdzają wyboru. Do odczytu wymagane są dwa zgodne obrazy ofert przed kliknięciem oraz znane, dokładnie odczytane nazwy wszystkich trzech kart. Bardzo szybki wybór, nieczytelna nazwa, zasłonięta ramka lub nowy augment spoza katalogu mogą zostać pominięte. Kliknięcie samego ozdobnego brzegu karty także może zostać pominięte.
- **Augmenty i ekwipunek** nadal pozwalają poprawić wybór ręcznie. Odczyt nie odtwarza wyborów dokonanych przed uruchomieniem asystenta i nie rozpoznaje losowo przyznanych augmentów bez ekranu wyboru. Ukończenie questów pozostaje ręczne. Brak odczytu nie usuwa już zapisanych augmentów.
- Obraz pochodzi wyłącznie z okna procesu gry, bez dźwięku; pozostaje w pamięci tego komputera. Systemowy OCR Windows musi mieć język polski lub angielski. W razie czarnego obrazu użyj okna bez ramek. Pomocnik odczytuje stan głównego przycisku myszy i Escape tylko w aktywnym oknie LoL-a; nie przechwytuje wpisywanego tekstu, nie generuje wejścia i nie odczytuje pamięci gry. Obrazy, tekst OCR i kliknięcia nie są zapisywane na dysk ani wysyłane do sieci. Zamknięcie meczu lub wyłączenie funkcji zatrzymuje pomocników.

Weryfikacja: `npm test`, `npm run test:offers` (pełny przepływ aplikacji, symulowane karty i kliknięcia, prawdziwy OCR Windows), `npm run test:ocr`, `node_modules/.bin/electron test/clicks-smoke.cjs` (prawdziwy pomocnik Windows na ukrytym oknie testowym), testy Mayhem i interfejsu. Opcjonalny `test/offers-reference-smoke.cjs` używa publicznego obrazu trzech rzeczywistych kart wskazanego w `OFFER_REFERENCE`, sprawdzając 720p, 1080p i ultrawide; sam obraz nie jest częścią repozytorium. Nie zastępuje to weryfikacji przechwytywania podczas żywego meczu na danej konfiguracji LoL-a.

## Wersja 0.6.19 (poprzedni odczyt z dymka)

- **Lokalny OCR augmentów bez Overwolfa (wersja eksperymentalna).** Po jednorazowej kalibracji odczytuje polskie i angielskie nazwy z dymka własnego, już posiadanego augmentu. Trzy kolejne odczyty tej samej dokładnej nazwy dopisują augment i przeliczają build. Wymaga pokazania dymka przez około 3 sekundy; nie jest całkowicie bezobsługowy.
- W meczu Mayhem wybierz **Ustaw OCR → Zdjęcie za 5 sekund**, wróć do gry i najedź na ikonę własnego augmentu. Po wykonaniu zdjęcia wróć do asystenta i zaznacz prostokątem samą nazwę w dymku, bez opisu. **Sprawdź odczyt**, potem **Włącz OCR**. Kolejne nazwy muszą pojawiać się w tym samym obszarze; po zmianie HUD lub rozdzielczości ustaw go ponownie. Obszar nie może obejmować proponowanych augmentów ani danych innych graczy.
- Przechwytywane jest tylko okno procesu gry, bez dźwięku. Do systemowego OCR Windows trafia wyłącznie wycięty tytuł. Obraz nie jest zapisywany na dysk ani wysyłany do sieci; zapamiętywane są współrzędne obszaru i rozpoznane identyfikatory. Zamknięcie meczu lub wyłączenie OCR zatrzymuje strumień i pomocniczy proces.
- OCR używa zainstalowanego w Windows języka polskiego lub angielskiego. Czarne/niewidoczne okno może wymagać przełączenia LoL-a na okno bez ramek. Brak obrazu, brak języka OCR, nieczytelna nazwa i kilka pasujących nazw mają osobne komunikaty. Pusty dymek nie usuwa wcześniejszych wyborów.
- Ręczna korekta jest dostępna w **Augmenty i ekwipunek**. Usunięty tam augment nie zostanie ponownie dopisany przez OCR w tym meczu; nowy mecz resetuje wyjątki. Ukończenie questów pozostaje ręczne. Kalibracja OCR jest wyłączona do pierwszego skonfigurowania.

Weryfikacja: `npm test`, `npm run test:ocr` (prawdziwy OCR Windows na wygenerowanych tytułach) oraz `npm run test:screen` (kalibracja, symulowany obraz gry, prawdziwy OCR i aktualizacja buildu). Testy OCR wymagają Windows i języka PL/EN; źródło obrazu w teście integracyjnym jest symulowane.

## Wersja 0.6.18

- Mayhem automatycznie odczytuje własny ekwipunek z lokalnego Live Client Data API co około 2 sekundy. Zakup, sprzedaż, ulepszenie i nagroda aktualizują build; gotowe przedmioty pozostają na swoich miejscach, a dalsze zakupy uwzględniają wybrane augmenty.
- Komponenty i mikstury są widoczne w rozwijanym odczycie. Komponenty nie zajmują slotów gotowych itemów; przy następnym zakupie aplikacja odejmuje ich wartość od kosztu ukończenia. Obsługiwany jest też pełny ekwipunek sześciu itemów po sprzedaży butów.
- Status rozróżnia aktywny odczyt, oczekiwanie i przerwę połączenia. Brak danych nie zeruje ekwipunku. Można przełączyć na ręczne ustawianie w **Augmenty i ekwipunek → Odczyt ekwipunku**; wybór dotyczy tego meczu. Tester draftów pozostaje ręczny i odizolowany od gry.
- W 0.6.18 wybór augmentów oraz ukończenie ich questów były ręczne. Od 0.6.19 wybory można uzupełniać opcjonalnym OCR opisanym powyżej. Lokalny interfejs Riot nie udostępnia potwierdzonego odczytu wybranych augmentów Mayhem.

Źródło odczytu: [Live Client Data API Riot](https://developer.riotgames.com/docs/lol#game-client-api_live-client-data-api). Połączenie wyłącznie z `127.0.0.1:2999`, tylko żądania GET. Dane pozostałych graczy z odpowiedzi nie są zapisywane. Zapisany ekwipunek jest przypisany do meczu, championa i wariantu Mayhem.

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
- Augmenty wybierasz ręcznie lub uzupełniasz lokalnym OCR; ukończenie questów zaznaczasz ręcznie. Od 0.6.18 ekwipunek jest odczytywany automatycznie, z możliwością ręcznej korekty po wyłączeniu odczytu. Dane zapisują się lokalnie dla danego meczu i championa, odtwarzają po restarcie oraz resetują w następnym meczu.
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
