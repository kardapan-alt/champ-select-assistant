# Champ Select Assistant

Asystent wyboru postaci do League of Legends (tylko champion select, nic w trakcie gry).

## Co robi
- Pokazuje championy Twojej drużyny (z rolami) i przeciwników na żywo, w miarę jak są wybierani.
- Sugeruje 10 picków na Twoją rolę z punktami maestrii z Twojego konta (sortowanie: najlepsze albo maestria). Liczy kontry na widocznych przeciwników, siłę w mecie (tier), synergie z sojusznikami, braki w składzie (AP/AD, frontline, engage) i archetyp obu drużyn. Pomija bany, zajęte i nieposiadane postacie.
- Tryb blind pick: dopóki nie widać przeciwnika z Twojej linii, promuje postacie mocne w mecie i z małą liczbą kontr. Gdy przeciwnik się pojawi, przełącza się na counter pick.
- W fazie banów sugeruje 5 banów: kontry Twojego hovera i picków sojuszników, mocne postacie z Twojej linii. Nigdy nie sugeruje bana postaci, którą hoveruje sojusznik.
- Pokazuje archetyp obu składów (dive, engage, poke, ochrona carry, pick, splitpush) ze wskazówką, jak grać przeciwko wrogowi.
- Importuje runy do klienta jednym kliknięciem (strona „CS Assist: …”; jeśli brak miejsca, nadpisuje aktualnie wybraną stronę).
- Runy, odłamki i czary dopasowuje do meczu i pokazuje, co zmienił i dlaczego: melee przeciw pokującemu dostaje Second Wind (na topie i midzie także Determinację jako drugie drzewko), przeciw all-inowi Kościaną Płytę, przy dużej liczbie CC u wroga odłamek Nieustępliwości. Czary: Bariera na midzie przeciw zabójcy, Podpalenie na wygranym matchupie na topie, Teleport na trudnym, Oczyszczenie dla ADC przy dużej ilości CC, Wyczerpanie dla supporta przeciw zabójcom. Flash i Smite zostają bez zmian.
- Ustawia czary przywoływacza (Flash zostaje na tym klawiszu, na którym go masz).
- Gdy wszyscy zablokują, pokazuje pełny build (buty + 5 itemów) dopasowany do składu wroga, z powodem przy każdym itemie, alternatywami, czarami i kolejnością umiejętności.
- Przycisk „Wyślij build do sklepu w grze” zapisuje ten build jako zestaw przedmiotów „CS Assist: …” (start, pierwszy powrót przeciw przeciwnikowi z linii, build w kolejności, bloki „Dlaczego: …” z powodami, alternatywy, wardy). W grze jest w sklepie w zakładce zestawów. Poprzedni zestaw aplikacji jest zastępowany, Twoje własne zestawy zostają.

## Statystyki z OP.GG
Aplikacja pobiera statystyki z oficjalnego, publicznego API OP.GG (serwer MCP `https://mcp-api.op.gg/mcp`, bez klucza):
- tiery i role wszystkich championów (także tych spoza wbudowanych danych),
- kontry (winrate w matchupach, od 1,5 pkt proc. od 50% i min. 100 gier), synergie,
- najpopularniejszy build, buty, runy, czary i kolejność umiejętności.

Pobiera tylko to, co jest potrzebne w danym champ selekcie (Twój champion, widoczni przeciwnicy, aktualne sugestie) i trzyma to w pamięci przez 6 godzin (`opgg-cache.json`). Gdy OP.GG nie odpowiada, aplikacja wraca do wbudowanych danych. Przy sprzecznych danych wygrywa OP.GG.

Statystyki dają bazę, a adaptacja zostaje: dwa pierwsze itemy z OP.GG są stałe, resztę slotów silnik dobiera pod skład wroga (MR, armor, antyleczenie itd.).

Przyciski w stopce: „Wyłącz OP.GG” (tylko własne dane) i „Diagnostyka OP.GG”, która zapisuje surowe odpowiedzi API do `Dokumenty\champ-select-diagnostyka-opgg.json`. Ten plik pozwala dopasować parser, jeśli OP.GG zmieni format.

## Jak build dopasowuje się do składu
Aplikacja liczy profil przeciwników: udział obrażeń AP/AD (tanki i enchanterzy liczą się mniej niż carry), CC, leczenie, tanki, burst i strzelców. Każdy item z puli (`itemPools`) ma tagi, np. `mr`, `armor`, `antiheal`, i dostaje punkty za to, jak odpowiada na te zagrożenia. Dwa pierwsze itemy championa zostają zawsze, a reszta slotów jest wybierana punktowo. Po każdym wybranym itemie zagrożenie słabnie tylko częściowo, więc np. przeciw Rumble, Amumu, Leona, Caitlyn, Lux (ok. 75% AP) bruiser dostanie Buty Merkurego i 2 itemy na MR, a przy zbalansowanym składzie co najwyżej jeden item obronny.

- Na ekranie ładowania pokazuje karty wszystkich 10 graczy (jak Porofessor): Riot ID, rangę z LP i winrate, gry i winrate championem w sezonie, gry championem w ostatnich 30 dniach, KDA, główną rolę oraz rozwijaną listę championów, którymi gra (sezon i ostatnie 30 dni, z liczbą gier, winrate i KDA), i tagi z ostatnich gier (OTP, doświadczony, dużo zgonów, dobra/słaba wizja, wysoki udział w zabójstwach, dobry farm, seria wygranych/porażek, gra poza rolą). Dane z OP.GG, odświeżane co 30 minut.
- Nad kartami pokazuje plan na linię: Twój przeciwnik z linii (jego karta jest wyróżniona), ocenę matchupu i winrate z OP.GG, 3–4 wskazówki (styl przeciwnika, jego statystyki, groźny wczesny jungler) i pierwszy item obronny pod typ jego obrażeń.

W champ selekcie aplikacja nie pokazuje nicków graczy ani żadnych ukrytych informacji (Riot pozwala na to dopiero od ekranu ładowania), nie automatyzuje picków/banów ani niczego w grze. Działa tylko na Twoje kliknięcie.

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
- `itemPools`: itemy sytuacyjne dla klas z tagami zagrożeń, `championTraits`: cechy pozostałych championów (AP, tank, leczenie, CC, burst)
Id run/itemów są sprawdzane z danymi klienta, więc po zmianie patcha błędne pozycje zostaną zastąpione lub pominięte. Po edycji kliknij „Wczytaj dane ponownie”.

## Testy bez gry
```
npm test                 # testy logiki na symulowanym kliencie
npm run mock             # symulowany klient na porcie 2999
node mock/mock-opgg.js   # symulowany OP.GG na porcie 3999
set LCU_MOCK=http://127.0.0.1:2999 && set OPGG_ENDPOINT=http://127.0.0.1:3999/mcp && npm start
```
Kroki scenariusza w symulatorze: `http://127.0.0.1:2999/__step?n=0` … `n=3`.

## Budowanie exe
`npm run dist` → folder `dist/`.
