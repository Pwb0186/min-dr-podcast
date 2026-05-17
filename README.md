# Min DR Podcast

Privat RSS-oversigt til DR-podcasts, hvor du selv bestemmer hvilke podcasts der skal med.

## Sådan styrer du listen

Ret `podcasts.json`.

Eksempel:

```json
{
  "siteTitle": "Mine DR Podcasts",
  "baseUrl": "https://DIT-BRUGERNAVN.github.io/DIT-REPO",
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

Feedet hentes fra:

```text
https://api.dr.dk/podcasts/v1/feeds/genstart.xml?format=podcast
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

## Byg siden

```bash
npm run build
```

Det laver en `public`-mappe med:

- `index.html`
- et RSS-feed pr. valgt podcast

## Automatisk opdatering på GitHub

Workflowet i `.github/workflows/update-feeds.yml` opdaterer feeds hver 6. time.

Når du har lagt projektet i et privat GitHub-repo:

1. Ret `baseUrl` i `podcasts.json`.
2. Gå til repositoryets `Settings`.
3. Under `Pages` vælger du `GitHub Actions` som kilde.
4. Gå til `Settings` -> `Secrets and variables` -> `Actions` -> `Variables`.
5. Opret variablen `SITE_BASE_URL` med din Pages-adresse, fx `https://DIT-BRUGERNAVN.github.io/DIT-REPO`.
6. Kør workflowet manuelt første gang under fanen `Actions`.

`SITE_BASE_URL` bruges til at skrive den rigtige adresse ind i RSS-feeds. Hvis den ikke er sat, bruges `baseUrl` fra `podcasts.json`.

## Brug i podcast-app

Når siden er bygget og udgivet, kan du abonnere på et feed som:

```text
https://DIT-BRUGERNAVN.github.io/DIT-REPO/genstart/feed.xml
```

Du kan også åbne forsiden og trykke på den podcast, du vil abonnere på.

## Om meta-podcasts som Tyran

Nogle DR-serier er samlet af flere underserier. `Tyran` er et eksempel, hvor episoder som Mao, Bokassa, Franco, Nijasov, Milosevic og Hirohito tidligere manglede på drpodcast.nu.

Denne private version henter som udgangspunkt DR's officielle podcast-feed:

```text
https://api.dr.dk/podcasts/v1/feeds/tyran.xml?format=podcast
```

Det feed indeholder de nævnte Tyran-episoder samlet. Derfor behøver denne version ikke den samme multi-URN-rettelse, som blev foreslået til DR1ommer-projektet.

Hvis du støder på en DR-podcast, hvor DR's officielle feed ikke samler alt korrekt, kan podcasten stadig tilføjes med en direkte `feedUrl` i `podcasts.json`:

```json
{
  "feedUrl": "https://api.dr.dk/podcasts/v1/feeds/tyran.xml?format=podcast",
  "title": "Tyran"
}
```
