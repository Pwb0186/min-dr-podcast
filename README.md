# Min DR Podcast

Privat RSS-oversigt til DR-podcasts, hvor du selv bestemmer hvilke podcasts der skal med.

Denne version kopierer ikke bare DR's officielle podcast-RSS. Den bygger nye RSS-feeds fra DR's underliggende episode-API og direkte lydlinks, så den minder mere om drpodcast.nu.

## Sådan styrer du listen

Ret `podcasts.json`.

Eksempel:

```json
{
  "siteTitle": "Mine DR Podcasts",
  "baseUrl": "https://Pwb0186.github.io/min-dr-podcast",
  "podcasts": [
    {
      "slug": "genstart",
      "title": "Genstart"
    }
  ]
}
```

`slug` er typisk navnet i DR-linket. Hvis DR-linket er:

```text
https://www.dr.dk/lyd/special-radio/genstart-2642056922000
```

så er slug:

```text
genstart
```

Generatoren finder selv DR-serien bag sluggen og henter episoder fra DR's radio-API. Lydfilerne i RSS-feedet kommer fra DR's assetlinks, fx:

```text
https://api.dr.dk/radio/v1/assetlinks/...
```

## Tilføj en podcast

Du kan enten redigere `podcasts.json` manuelt eller køre:

```bash
npm run add -- genstart
```

Du kan også bruge et DR-link:

```bash
npm run add -- https://www.dr.dk/lyd/special-radio/genstart-2642056922000
```

## Find den rigtige slug

Hvis en podcast ikke kan findes, kan du søge i DR's serieliste:

```bash
npm run search -- stjerner
```

eller:

```bash
npm run search -- "p6 elsker"
```

Søgningen viser titel, DR-link, slug og URN. Den viser også en JSON-blok, du kan kopiere direkte ind i `podcasts.json`.

Den mest fremtidssikre form er at bruge både `slug` og `urn`:

```json
{
  "slug": "stjerner-og-striber",
  "urn": "urn:dr:radio:series:...",
  "title": "Stjerner og striber"
}
```

## Byg siden

```bash
npm run build
```

Det laver en `public`-mappe med:

- `index.html`
- et RSS-feed pr. valgt podcast

## Automatisk opdatering på GitHub

Workflowet i `.github/workflows/update-feeds.yml` opdaterer feeds hver 6. time.

Når du har lagt projektet i dit GitHub-repo:

1. Ret `baseUrl` i `podcasts.json`, hvis repo-navnet eller brugernavnet ændrer sig.
2. Gå til repositoryets `Settings`.
3. Under `Pages` vælger du `GitHub Actions` som kilde.
4. Gå til `Settings` -> `Secrets and variables` -> `Actions` -> `Variables`.
5. Opret variablen `SITE_BASE_URL` med din Pages-adresse:

```text
https://Pwb0186.github.io/min-dr-podcast
```

6. Kør workflowet manuelt første gang under fanen `Actions`.

`SITE_BASE_URL` bruges til at skrive den rigtige adresse ind i RSS-feeds. Hvis den ikke er sat, bruges `baseUrl` fra `podcasts.json`.

## GitHub Actions og DR API

Generatoren bruger en DR API-nøgle, som også bruges i det oprindelige DR1ommer-projekt. Den ligger som standard i scriptet, så du behøver normalt ikke gøre noget.

Hvis den en dag stopper med at virke, kan du oprette en GitHub Actions variable:

```text
DR_API_KEY
```

og sætte den til en ny nøgle.

## Brug i podcast-app

Når siden er bygget og udgivet, kan du abonnere på et feed som:

```text
https://DIT-BRUGERNAVN.github.io/DIT-REPO/genstart/feed.xml
```

Du kan også åbne forsiden og trykke på den podcast, du vil abonnere på.

## Om meta-podcasts som Tyran

Nogle DR-serier er samlet af flere underserier. `Tyran` er et eksempel, hvor episoder som Mao, Bokassa, Franco, Nijasov, Milosevic og Hirohito tidligere manglede på drpodcast.nu.

Denne private version understøtter samme princip som rettelsen i DR1ommer-projektet: hvis en slug er en samlet meta-serie, finder generatoren de underliggende serier og samler episoderne i ét feed.

`Tyran` er testet og bygges som et samlet feed med under-serierne.

Hvis den automatiske slug-finding en dag ikke rammer rigtigt, kan en podcast også angives med en eller flere DR-URNs i `podcasts.json`:

```json
{
  "slug": "tyran",
  "urns": [
    "urn:dr:radio:series:..."
  ],
  "title": "Tyran"
}
```
