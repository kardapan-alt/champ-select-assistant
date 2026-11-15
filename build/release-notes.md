## Champ Select Assistant 0.6.24

- Automatyczne wykrywanie Headlinera z widocznej nazwy i opisu wydarzenia. Dziewięć Headlinerów, polskie i angielskie teksty, trzy zgodne odczyty Windows OCR. Bez Overwolfa, najeżdżania i kalibracji.
- Ręczna korekta ma pierwszeństwo; wykryty Headliner nie znika po zapisaniu starszego formularza augmentów. Ustawienia są ograniczone do jednego meczu.
- Automatyczny wynik z komunikatu końca gry lub danych klienta, z ponawianiem odczytu i sprawdzeniem historii tego samego meczu. Brak danych pozostaje nieznanym wynikiem.
- Otwarty panel podsumowania aktualizuje wynik po nadejściu danych. Opcjonalna ręczna korekta i powrót do automatycznego wyniku.

Headliner wymaga czytelnego komunikatu wydarzenia i włączonego automatycznego OCR. Wzmocniona umiejętność Pentakill oraz modyfikatory HEARTSTEEL nadal wymagają osobnej oceny. Odczyt Headlinera jest eksperymentalny; nie był jeszcze testowany w rzeczywistym meczu.

Walidacja: 186 testów logiki, testy całej aplikacji na symulowanych meczach i prawdziwy OCR Windows na testowych komunikatach. Format wyniku sprawdzono na danych historii w lokalnym kliencie.
