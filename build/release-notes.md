## Champ Select Assistant 0.6.28

- Gragas oraz inni wojownicy i zabójcy AP bez gotowego buildu korzystają z szablonu AP. Rola postaci nie podmienia go na rdzeń AD. Kupione i przypięte przedmioty oraz świadoma konwersja AP/AD z augmentu pozostają zachowane.
- Oceny S–F pod oferowanymi i zapisanymi augmentami, z uzasadnieniem dopasowania do postaci, przedmiotów i synergii. To ocena regułowa dla bieżącego buildu, nie globalna tierlista ani winrate. „—” oznacza brak podstaw do oceny.
- Wszystkie 13 ulepszeń przedmiotów z katalogu mają jawnie wskazany cel zakupu i status: w buildzie, kupiony albo poza planem. Stormsurge jest przyspieszany po zapisaniu jego augmentu. Sheen oraz Immolate wybierają jeden odpowiedni wariant.
- OCR lepiej obsługuje wolniejsze odczyty i nie myli pojedynczej krawędzi mapy ze stale otwartą kartą. Statusy rozdzielają brak obrazu, czytanie nazw, potwierdzanie kart i zapis wyboru. Headliner nie jest wymagany do odczytu augmentów.
- Lokalne augment-diagnostics.json zawiera czas i etap odczytu, rozmiar obrazu oraz identyfikatory rozpoznanych augmentów. Nie zawiera zdjęć, pełnego tekstu OCR ani nazw kont.

Walidacja: 218 testów logiki; rzeczywisty Windows OCR na kartach testowych, w tym wybór Stormsurge → zapis → build i ocena; publiczne zdjęcie kart w 720p, 1080p i ultrawide. Pełny odczyt wyboru w meczu użytkownika nie został jeszcze potwierdzony. Wcześniej pominięte wybory wymagają uzupełnienia w „Augmenty i ekwipunek”.

Po pobraniu aktualizacji wybierz „Uruchom ponownie”. Krzyżyk tylko ukrywa okno. Sprawdzanie wydań odbywa się przy starcie i co 6 godzin.
