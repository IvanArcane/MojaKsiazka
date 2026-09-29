# Moja Półka

Prosta aplikacja PWA do przechowywania przeczytanych książek w lokalnym pliku `books.json`.
Vite + Vanilla TypeScript, HTML i CSS. Bez kont, backendu, synchronizacji i bazy danych.

Adres aplikacji: **https://IvanArcane.github.io/MojaKsiazka/**

## Korzystanie z aplikacji

1. Otwórz aplikację w aktualnym Chrome na Androidzie lub komputerze.
2. Kliknij **Utwórz nową bibliotekę** i zapisz `books.json` np. w Dokumentach.
   Jeśli masz już bibliotekę, kliknij **Otwórz istniejący books.json** i wskaż plik.
3. Kliknij **Dodaj książkę**. Wpisz ISBN, wybierz **Szukaj**, następnie **Dodaj do półki**.
   ISBN do próby: `9780140328721` — *Fantastic Mr. Fox*, Roald Dahl.
4. Na Androidzie możesz zamiast wpisywania wybrać **Skanuj ISBN**, zezwolić na aparat i skierować go na kod EAN-13 zaczynający się od 978 lub 979.
5. Kliknij kartę książki, aby zobaczyć szczegóły lub **Usuń z półki**. Usunięcie wymaga potwierdzenia.
6. Zamknij aplikację, otwórz ją ponownie i ponownie wskaż ten sam plik `books.json`.
   Książki zostaną odczytane z pliku.

### Zapis i import/eksport

- Gdy przeglądarka obsługuje wybór i zapis plików, każda zmiana zapisuje się do wskazanego pliku.
- Po utracie zgody kliknij **Nadaj ponownie dostęp do pliku**. Niezapisane zmiany pozostają w bieżącej sesji i można je pobrać jako JSON. Nie zamykaj aplikacji przed zapisem.
- Jeśli plik zmieniono poza aplikacją, zapis nie nadpisze go automatycznie. Pobierz kopię swojej półki i otwórz wybraną bibliotekę ponownie.
- Bez obsługi File System Access API aplikacja przechodzi na import/eksport. Po zmianach koniecznie kliknij **Pobierz books.json** i sprawdź zakończenie pobierania. Przeglądarka może utworzyć `books (1).json` zamiast nadpisać poprzedni plik. Przy ponownym otwarciu wskaż **najnowszą kopię**.
- Przycisk **Użyj importu i eksportu JSON** pozwala wybrać ten tryb również w przeglądarce z obsługą bezpośredniego zapisu.
- Dane i uchwyt pliku nie są utrwalane w localStorage, IndexedDB ani cache. Dlatego po ponownym uruchomieniu trzeba wskazać plik. Bez eksportu dane w trybie importu/eksportu znikną po zamknięciu strony. Ostrzeżenie przeglądarki przed zamknięciem może nie pojawić się na telefonie.
- Plik jest sprawdzany przed otwarciem; błędny JSON nie zastępuje otwartej biblioteki. Limit pliku to 10 MB.

### Instalacja i aparat na Androidzie

Otwórz **adres HTTPS GitHub Pages**. Kliknij **Zainstaluj aplikację**, jeśli ten przycisk jest widoczny, albo otwórz menu Chrome (⋮) i wybierz **Zainstaluj aplikację** / **Dodaj do ekranu głównego**. Nazwa opcji zależy od wersji Chrome. Uruchom aplikację z ikony — powinna otworzyć się bez paska adresu.

Skaner korzysta z wbudowanego `BarcodeDetector` z formatem `ean_13`, bez dodatkowej biblioteki. Aparat uruchamia się wyłącznie po kliknięciu. Wyłącza się po poprawnym odczycie, zamknięciu okna skanera lub przejściu aplikacji w tło. Przy odmowie zgody albo braku obsługi skanera pozostaje ręczne wpisywanie ISBN. Nie każdy komputer i każda przeglądarka obsługuje skanowanie.

Nie testuj aparatu przez `http://192.168.x.x:5173`. Aparat i wybieranie plików wymagają bezpiecznego kontekstu: HTTPS (lub localhost na tym samym komputerze).

### Offline i Open Library

Po pierwszym otwarciu online service worker zapisuje pliki aplikacji, manifest i ikony. Półkę można otworzyć z JSON również offline. Okładki mogą być wtedy niedostępne. Wyszukiwanie wymaga internetu.

ISBN-10 i ISBN-13 są sprawdzane razem z sumą kontrolną; równoważne numery nie tworzą duplikatu. Dane pochodzą wyłącznie z Open Library (wydanie, dzieło i autorzy). Opisy i okładki nie zawsze są dostępne. Nie znaleziono tytułu — aplikacja pokazuje **Nie znaleziono książki**. Moduł `src/open-library.ts` można później zastąpić innym dostawcą.

Service worker nie zapisuje biblioteki użytkownika ani odpowiedzi Open Library. Cała biblioteka nie jest wysyłana na serwer; zapytania o ISBN, autora, opis i okładkę trafiają do Open Library. Aktualizacje plików aplikacji otrzymują nową wersję cache przy buildzie; po publikacji zamknij i ponownie otwórz aplikację, aby korzystać z nowej wersji.

## Uruchomienie lokalne

Wymagany Node.js 24 LTS z npm oraz Git. Zależności są zapisane w `package-lock.json`.
Polecenia uruchamiaj w folderze `MojaKsiazka`.

Zainstaluj zależności:

```sh
npm install
```

Uruchom środowisko programistyczne:

```sh
npm run dev
```

Otwórz **http://localhost:5173/MojaKsiazka/** (lub adres podany przez terminal). W PowerShell, jeśli blokuje uruchamianie `npm.ps1`, możesz użyć `npm.cmd` zamiast `npm`.

Sprawdź TypeScript i zbuduj wersję produkcyjną z service workerem:

```sh
npm run build
```

Uruchom podgląd produkcyjny (z PWA):

```sh
npm run preview
```

Otwórz **http://localhost:4173/MojaKsiazka/**. Zwykły tryb `dev` nie rejestruje service workera.

## Testy

Walidacja ISBN i JSON, duplikaty, poprawność zapisu danych i bezpieczne adresy okładek:

```sh
npm test
```

Jednorazowo pobierz przeglądarkę testową:

```sh
npx playwright install chromium
```

Po buildzie uruchom testy przeglądarkowe (automatycznie uruchamiają podgląd na porcie 4173):

```sh
npm run test:e2e
```

Testy obejmują widok komputera i telefonu: bibliotekę, wyszukiwanie, import i pobieranie JSON, błędy i anulowanie wyboru pliku, brak internetu, manifest, cache, odmowę aparatu i zatrzymywanie skanera. Aparat, wybieranie plików przez system i odpowiedzi API są symulowane w tych testach. Prawdziwy odczyt kodu kreskowego oraz instalację należy sprawdzić na fizycznym Androidzie.

## Publikacja na GitHub Pages

Repozytorium: `IvanArcane/MojaKsiazka`. W **Settings → Pages → Build and deployment → Source** wybierz **GitHub Actions** (konfiguracja jednorazowa).

Workflow `.github/workflows/deploy.yml` po pushu do `main` instaluje zależności przez `npm ci`, uruchamia testy, buduje `dist`, testuje przeglądarkę i publikuje stronę. Można go również uruchomić ręcznie z karty **Actions**.

Przed wysłaniem zmian sprawdź pliki:

```sh
git status
```

Po zapisaniu wybranych zmian w commicie wyślij gałąź:

```sh
git push origin main
```

Nie umieszczaj prywatnego `books.json` w repozytorium. Pliki `books*.json` są wykluczone przez `.gitignore`.

W `vite.config.ts` ustawiono `base: '/MojaKsiazka/'`. Przy innej nazwie repozytorium zmień tę wartość. Manifest i service worker używają ścieżek zgodnych z podkatalogiem projektu.

## Format books.json

```json
{
  "version": 1,
  "books": [
    {
      "isbn": "9780140328721",
      "title": "Fantastic Mr. Fox",
      "authors": ["Roald Dahl"],
      "description": "",
      "coverUrl": "",
      "addedAt": "2026-09-29T18:00:00.000Z"
    }
  ]
}
```

Pusta biblioteka: `{ "version": 1, "books": [] }`. Pola `description` i `coverUrl` mogą być puste; ich brak przy imporcie jest traktowany jak pusty tekst.

## Pliki projektu

- `src/main.ts` — interfejs i obsługa zdarzeń.
- `src/library.ts` — typy, ISBN i walidacja biblioteki.
- `src/storage.ts` — lokalny plik i import/eksport.
- `src/open-library.ts` — pobieranie danych książek.
- `src/scanner.ts` — aparat i odczyt EAN-13.
- `public/` — manifest i ikony PWA.
- `scripts/build-sw.mjs` — generowanie cache plików aplikacji.
- `tests/` — testy danych i przeglądarki.

Licencja: [GPL-3.0](LICENSE).
