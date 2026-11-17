## Wersja 0.6.32

- Uzupełniona baza wszystkich 173 championów: osobne rdzenie i późniejsze zakupy dla Summoner’s Rift oraz ARAM, na podstawie publicznych danych OP.GG z patcha 16.22. Mayhem korzysta z bazy ARAM przed dopasowaniem do augmentów.
- Naprawione odczyty buildów: komponenty nie wypychają trzeciego gotowego przedmiotu; Muramana, Seraph’s Embrace, Fimbulwinter i Diadem wskazują właściwy przedmiot do kupienia. Warianty Jade nie przejmują ról zwykłych championów.
- Późniejsze zakupy respektują wybrany styl AP/AD, kryty, on-hit i wsparcie. Zwykła zmiana roli nie zastępuje własnego rdzenia zestawem innej postaci. IE pozostaje w bazowych buildach pod kryty, a postacie bez many nie dostają przypadkowych ofensywnych przedmiotów many.
- Rozszerzony filtr wspólnego Spellblade, również dla Dusk and Dawn i Essence Reaver. Kupione i przypięte przedmioty nadal mają pierwszeństwo.
- Widoczne źródło, patch i data zapisanej bazy. Nieaktualny format pamięci analiz jest odrzucany; stara baza lokalna ma kopię zapasową przed migracją. Ustawienia aplikacji i własne przypięcia pozostają zachowane.

Walidacja: 237 testów logiki, w tym 2076 zestawów bez augmentów (173 postacie × 3 tryby × 4 składy przeciwników), warianty klienta, parser OP.GG, konwersje, zasoby i dotychczasowa macierz 5094 kombinacji augmentów. Pełny test aplikacji obejmuje zakupy, migrację bazy i prezentację źródła. Testy sprawdzają spójność rekomendacji; nie są pomiarem winrate ani gwarancją najlepszego buildu w każdym meczu.

Zapisane buildy ARAM nie są statystykami Mayhem. Prośby, liczby gier i hashe odpowiedzi źródłowych opisano w data/base-build-evidence.json; odświeżanie bazy dokumentuje scripts/import-base-builds.js.

Po pobraniu aktualizacji wybierz „Uruchom ponownie”. Krzyżyk tylko ukrywa okno. Sprawdzanie wydań odbywa się przy starcie i co 6 godzin.
