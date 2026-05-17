import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "public");
const configPath = join(root, "podcasts.json");

const config = JSON.parse(await readFile(configPath, "utf8"));
const siteTitle = config.siteTitle || "Mine DR Podcasts";
const baseUrl = (process.env.SITE_BASE_URL || config.baseUrl || "").replace(/\/$/, "");
const podcasts = Array.isArray(config.podcasts) ? config.podcasts : [];

if (!baseUrl || baseUrl.includes("DIT-BRUGERNAVN")) {
  console.warn("Husk at rette baseUrl i podcasts.json, før du bruger feeds i en podcast-app.");
}

await mkdir(publicDir, { recursive: true });
await mkdir(join(publicDir, "assets"), { recursive: true });

const css = `
:root {
  color-scheme: light;
  font-family: Arial, Helvetica, sans-serif;
  background: #f6f4ef;
  color: #17211f;
}

body {
  margin: 0;
}

header, main {
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px 18px;
}

header {
  padding-top: 40px;
}

h1 {
  margin: 0 0 8px;
  font-size: 34px;
}

p {
  margin: 0;
  color: #52605c;
}

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 18px 0 24px;
}

input {
  width: 100%;
  max-width: 440px;
  padding: 12px 14px;
  border: 1px solid #ccd4cf;
  border-radius: 8px;
  font-size: 16px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 18px;
}

.podcast {
  display: block;
  color: inherit;
  text-decoration: none;
}

.podcast img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  background: #d8ded9;
}

.podcast strong {
  display: block;
  margin-top: 8px;
  line-height: 1.25;
}

.podcast small {
  color: #69736f;
}
`;

await writeFile(join(publicDir, "assets", "style.css"), css.trimStart(), "utf8");

const rendered = [];

for (const podcast of podcasts) {
  if (!podcast.slug && !podcast.feedUrl) continue;

  const slug = podcast.slug || slugFromFeedUrl(podcast.feedUrl);
  const feedUrl = podcast.feedUrl || `https://api.dr.dk/podcasts/v1/feeds/${slug}.xml?format=podcast`;
  const targetDir = join(publicDir, slug);

  console.log(`Henter ${podcast.title || slug}`);
  const response = await fetch(feedUrl, {
    headers: {
      "user-agent": "privat-dr-podcast-manager/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Kunne ikke hente ${feedUrl}: ${response.status} ${response.statusText}`);
  }

  let xml = await response.text();
  const title = podcast.title || findFirst(xml, /<title><!\[CDATA\[(.*?)\]\]><\/title>/s) || findFirst(xml, /<title>(.*?)<\/title>/s) || slug;
  const imageUrl =
    podcast.imageUrl ||
    findFirst(xml, /<itunes:image[^>]+href="([^"]+)"/i) ||
    findFirst(xml, /<image>\s*<url>(.*?)<\/url>/s);

  if (baseUrl) {
    const selfUrl = `${baseUrl}/${slug}/feed.xml`;
    xml = xml
      .replace(/<atom:link\b[^>]*rel="self"[^>]*\/>/i, `<atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>`)
      .replace(/<itunes:new-feed-url>.*?<\/itunes:new-feed-url>/is, `<itunes:new-feed-url>${escapeXml(selfUrl)}</itunes:new-feed-url>`);
  }

  await mkdir(targetDir, { recursive: true });
  await writeFile(join(targetDir, "feed.xml"), xml, "utf8");

  rendered.push({
    slug,
    title: decodeXml(title.trim()),
    imageUrl,
    feedPath: `${slug}/feed.xml`
  });
}

const cards = rendered
  .sort((a, b) => a.title.localeCompare(b.title, "da"))
  .map((podcast) => {
    const image = podcast.imageUrl
      ? `<img src="${escapeHtml(podcast.imageUrl)}" alt="${escapeHtml(podcast.title)}">`
      : `<img alt="${escapeHtml(podcast.title)}">`;

    return `
      <a class="podcast" href="${escapeHtml(podcast.feedPath)}" data-title="${escapeHtml(podcast.title.toLowerCase())}">
        ${image}
        <strong>${escapeHtml(podcast.title)}</strong>
        <small>RSS-feed</small>
      </a>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(siteTitle)}</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header>
    <h1>${escapeHtml(siteTitle)}</h1>
    <p>Privat RSS-oversigt styret fra podcasts.json.</p>
  </header>
  <main>
    <div class="toolbar">
      <input id="search" type="search" placeholder="Søg i dine podcasts" aria-label="Søg i dine podcasts">
    </div>
    <section class="grid" id="podcasts">
${cards}
    </section>
  </main>
  <script>
    const input = document.querySelector("#search");
    const cards = [...document.querySelectorAll(".podcast")];
    input.addEventListener("input", () => {
      const value = input.value.trim().toLowerCase();
      for (const card of cards) {
        card.hidden = value && !card.dataset.title.includes(value);
      }
    });
  </script>
</body>
</html>
`;

await writeFile(join(publicDir, "index.html"), html, "utf8");

console.log(`Byggede ${rendered.length} podcasts i public/.`);

function findFirst(text, regex) {
  return regex.exec(text)?.[1];
}

function slugFromFeedUrl(feedUrl) {
  const match = /\/feeds\/([^/?]+)\.xml/i.exec(feedUrl);
  if (!match) throw new Error(`Kan ikke finde slug i feedUrl: ${feedUrl}`);
  return match[1];
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeXml(value = "") {
  return escapeHtml(value).replaceAll("'", "&apos;");
}

function decodeXml(value = "") {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}
