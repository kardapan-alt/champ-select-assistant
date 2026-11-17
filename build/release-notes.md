## Wersja 0.6.33

- Zweryfikowana baza run dla wszystkich 173 championów: 253 strony dla popularnych ról na Summoner’s Rift i 173 osobne strony ARAM, z publicznych danych OP.GG dla patcha 16.22. Zmiana roli korzysta z własnej strony championa; przy braku statystyk pokazuje informację o użyciu własnej bazy zamiast kopiować runy innej postaci.
- Obrona reaguje na poke i krótkie wymiany oraz obu przeciwników na dolnej linii. Potwierdzona pozycja z klienta ma pierwszeństwo przed typową rolą; niejednoznaczny skład nie wymusza zgadywania linii. Zamiana ról przy tych samych championach odświeża także automatyczny import run.
- Runy kluczowe pozostają zgodne z bazą championa. Reguły chronią Last Stand i potrzebne runy zasobów przed ogólną zamianą. Presence of Mind pozostaje dostępne dla postaci z energią; Manaflow Band nie trafia na postacie bez many. Odłamek nieustępliwości bierze pod uwagę konkretne CC zamiast liczyć każde podbicie jako odpowiedni powód.
- Naprawione stare presety z usuniętą Eyeball Collection. ARAM nie dostaje run wymagających wardów lub rzeki. Mayhem nadal ma wyłączony import run.
- Panel run pokazuje tryb/rolę, źródło, patch i datę bazy; szczegóły danych obejmują osobno stronę run. Własne przypięcia i zmiany w kliencie pozostają zachowane. Migracja zapisuje kopię poprzedniej bazy.

Walidacja: 247 testów logiki, w tym 2556 draftów dla 426 stron run, wszystkie role, warianty Jade, zasoby, ARAM, rodzaje CC i ręczne przypięcia. Pełny test aplikacji sprawdza import do symulowanego klienta, zamianę ról, ochronę ręcznych zmian, ARAM, Mayhem i migrację bazy. Strony są punktem wyjścia do dopasowania; statystyki popularności nie gwarantują najlepszego wyboru w każdym meczu.

Źródła i ślady przeglądu: data/base-rune-evidence.json (OP.GG), data/rune-context.json (katalog lokalnego klienta Riot), oficjalne opisy run Riot Data Dragon 16.22.1. Import bazy: scripts/import-base-runes.js.

Po pobraniu aktualizacji wybierz „Uruchom ponownie”. Krzyżyk tylko ukrywa okno. Sprawdzanie wydań odbywa się przy starcie i co 6 godzin.
