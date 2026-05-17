import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DR_API_KEY = process.env.DR_API_KEY || "6Wkh8s98Afx1ZAaTT4FuWODTmvWGDPpR";
const DR_API_URL = process.env.DR_API_URL || "https://api.dr.dk/radio/v2";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "public");
const configPath = join(root, "podcasts.json");

const config = JSON.parse(await readFile(configPath, "utf8"));
const siteTitle = config.siteTitle || "Mine DR Podcasts";
const baseUrl = (process.env.SITE_BASE_URL || config.baseUrl || "").replace(/\/$/, "");
const podcasts = Array.isArray(config.podcasts) ? config.podcasts : [];

if (!baseUrl || baseUrl.includes("DIT-BRUGERNAVN")) {
  console.warn("Husk at rette baseUrl i podcasts.json eller SITE_BASE_URL på GitHub.");
}

await mkdir(publicDir, { recursive: true });
await mkdir(join(publicDir, "assets"), { recursive: true });
await writeFile(join(publicDir, "assets", "style.css"), css(), "utf8");

console.log("Henter DR's serieliste");
const seriesIndex = await loadSeriesIndex();
const rendered = [];

for (const podcast of podcasts) {
  const slug = podcast.slug || slugFromFeedUrl(podcast.feedUrl);
  const resolved = resolvePodcast(seriesIndex, podcast, slug);

  console.log(`Bygger ${podcast.title || resolved.primary.title} (${slug})`);
  const showInfos = await Promise.all(resolved.urns.map((urn) => fetchJson(`${DR_API_URL}/series/${encodeURIComponent(urn)}`)));
  const primaryShow = showInfos.find((show) => show.id === resolved.primaryUrn) || showInfos[0];
  const episodeGroups = await Promise.all(resolved.urns.map((urn) => fetchEpisodes(urn)));
  const episodes = uniqueByProductionNumber(episodeGroups.flat())
    .sort((a, b) => new Date(b.publishTime) - new Date(a.publishTime));

  if (!episodes.length) {
    console.warn(`Springer ${slug} over, fordi der ikke blev fundet episoder.`);
    continue;
  }

  const title = podcast.title || primaryShow.title || slug;
  const imageUrl =
    (await findPodcastImageUrl(slug).catch(() => "")) ||
    findRadioImageUrl(primaryShow);
  const feedUrl = `${baseUrl}/${slug}/feed.xml`;
  const targetDir = join(publicDir, slug);

  await mkdir(targetDir, { recursive: true });
  await writeFile(
    join(targetDir, "feed.xml"),
    renderFeed({
      feedUrl,
      title,
      link: primaryShow.presentationUrl,
      description: `${primaryShow.description || ""}\nGenudgivet privat RSS-feed.`,
      imageUrl,
      imageLink: primaryShow.presentationUrl,
      category: primaryShow.categories?.[0] || "News",
      lastBuildDate: formatRssDate(new Date(episodes[0].publishTime)),
      items: episodes.map((episode) => toFeedItem(episode, primaryShow.presentationUrl))
    }),
    "utf8"
  );

  rendered.push({
    slug,
    title,
    imageUrl,
    feedPath: `${slug}/feed.xml`
  });
}

await writeFile(join(publicDir, "index.html"), renderIndex(rendered), "utf8");
console.log(`Byggede ${rendered.length} podcasts i public/.`);

async function loadSeriesIndex() {
  const data = await fetchJson(`${DR_API_URL}/series?limit=10000`);
  const items = (data.items || []).filter((item) => item.type === "Series");
  const bySlug = new Map();
  const umbrellaGroups = new Map();

  for (const item of items) {
    const derivedSlug = deriveSlug(item);
    const umbrellaSlug = deriveUmbrellaSlug(item.umbrella);
    if (derivedSlug) {
      bySlug.set(derivedSlug, item);
    }
    if (umbrellaSlug && item.id) {
      const group = umbrellaGroups.get(umbrellaSlug) || [];
      group.push(item);
      umbrellaGroups.set(umbrellaSlug, group);
    }
  }

  return { bySlug, umbrellaGroups };
}

function resolvePodcast(index, podcast, slug) {
  if (podcast.urns?.length) {
    return {
      urns: podcast.urns,
      primaryUrn: podcast.urns[0],
      primary: index.bySlug.get(slug) || { title: podcast.title || slug }
    };
  }

  if (podcast.urn) {
    return {
      urns: [podcast.urn],
      primaryUrn: podcast.urn,
      primary: index.bySlug.get(slug) || { title: podcast.title || slug }
    };
  }

  const umbrella = index.umbrellaGroups.get(slug);
  if (umbrella?.length > 1) {
    return {
      urns: umbrella.map((item) => item.id),
      primaryUrn: umbrella[0].id,
      primary: index.bySlug.get(slug) || umbrella[0]
    };
  }

  const show = index.bySlug.get(slug);
  if (!show) {
    throw new Error(`Kunne ikke finde DR-serien "${slug}". Tjek slug i podcasts.json.`);
  }

  return {
    urns: [show.id],
    primaryUrn: show.id,
    primary: show
  };
}

async function fetchEpisodes(urn) {
  const episodes = [];
  let url = `${DR_API_URL}/series/${encodeURIComponent(urn)}/episodes?limit=256`;

  while (url) {
    const data = await fetchJson(url);
    episodes.push(...(data.items || []));
    url = data.next ? String(data.next) : "";
  }

  return episodes;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "referer": "https://www.dr.dk/",
      "user-agent": "privat-dr-podcast-manager/2.0",
      "x-apikey": DR_API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`DR API svarede ${response.status} for ${url}`);
  }

  return response.json();
}

async function findPodcastImageUrl(slug) {
  const response = await fetch(`https://api.dr.dk/podcasts/v1/feeds/${slug}.xml?format=podcast`, {
    headers: { "user-agent": "privat-dr-podcast-manager/2.0" }
  });
  if (!response.ok) return "";
  const xml = await response.text();
  return (
    /<itunes:image[^>]+href="([^"]+)"/i.exec(xml)?.[1] ||
    /<image>\s*<url>(.*?)<\/url>/s.exec(xml)?.[1] ||
    ""
  );
}

function findRadioImageUrl(show) {
  const asset =
    show.imageAssets?.find((image) => image.target === "Podcast") ||
    show.imageAssets?.find((image) => image.target === "SquareImage") ||
    show.imageAssets?.find((image) => image.ratio === "1:1") ||
    show.imageAssets?.[0];

  return asset?.id ? `https://asset.dr.dk/drlyd/images/${asset.id}` : "";
}

function toFeedItem(episode, fallbackLink) {
  const audioAsset = (episode.audioAssets || [])
    .filter((asset) => asset.target === "Progressive" && asset.format === "mp3")
    .sort((a, b) => Math.abs((a.bitrate || 0) - 192) - Math.abs((b.bitrate || 0) - 192))[0];

  if (!audioAsset) return null;

  return {
    guid: episode.productionNumber || episode.id,
    link: episode.presentationUrl || fallbackLink,
    title: episode.title || "Uden titel",
    description: episode.description || "",
    pubDate: formatRssDate(new Date(episode.publishTime)),
    duration: formatDuration(episode.durationMilliseconds || 0),
    enclosureUrl: audioAsset.url,
    enclosureByteLength: audioAsset.fileSize || 0
  };
}

function renderFeed(feed) {
  const items = feed.items.filter(Boolean).map((item) => `
        <item>
            <guid isPermalink="false">${xml(item.guid)}</guid>
            <link>${xml(item.link)}</link>
            <title>${xml(item.title)}</title>
            <description>${xml(item.description)}</description>
            <pubDate>${xml(item.pubDate)}</pubDate>
            <explicit>no</explicit>
            <itunes:author>DR</itunes:author>
            <itunes:duration>${xml(item.duration)}</itunes:duration>
            <media:restriction relationship="allow" type="country">dk</media:restriction>
            <enclosure length="${xml(item.enclosureByteLength)}" type="audio/mpeg" url="${xml(item.enclosureUrl)}"/>
        </item>`).join("");

  const image = feed.imageUrl ? `
        <image>
            <url>${xml(feed.imageUrl)}</url>
            <title>${xml(feed.title)}</title>
            <link>${xml(feed.imageLink)}</link>
        </image>
        <itunes:image href="${xml(feed.imageUrl)}"/>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
    <channel>
        <atom:link href="${xml(feed.feedUrl)}" rel="self" type="application/rss+xml"/>
        <title>${xml(feed.title)}</title>
        <link>${xml(feed.link)}</link>
        <description>${xml(feed.description)}</description>
        <language>da</language>
        <copyright>DR</copyright>
        <managingEditor>no-reply@example.invalid</managingEditor>
        <lastBuildDate>${xml(feed.lastBuildDate)}</lastBuildDate>
        <itunes:explicit>no</itunes:explicit>
        <itunes:author>DR</itunes:author>
        <itunes:owner>
            <itunes:email>no-reply@example.invalid</itunes:email>
            <itunes:name>DR</itunes:name>
        </itunes:owner>
        <itunes:new-feed-url>${xml(feed.feedUrl)}</itunes:new-feed-url>${image}
        <itunes:category text="${xml(feed.category)}"/>
        <media:restriction relationship="allow" type="country">dk</media:restriction>${items}
    </channel>
</rss>
`;
}

function renderIndex(rendered) {
  const cards = rendered
    .sort((a, b) => a.title.localeCompare(b.title, "da"))
    .map((podcast) => `
      <a class="podcast" href="${html(podcast.feedPath)}" data-title="${html(podcast.title.toLowerCase())}">
        ${podcast.imageUrl ? `<img src="${html(podcast.imageUrl)}" alt="${html(podcast.title)}">` : `<span class="cover">${html(podcast.title.slice(0, 1))}</span>`}
        <strong>${html(podcast.title)}</strong>
        <small>RSS-feed</small>
      </a>`)
    .join("\n");

  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(siteTitle)}</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header>
    <h1>${html(siteTitle)}</h1>
    <p>Private RSS-feeds bygget fra DR's episode-API.</p>
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
}

function deriveSlug(item) {
  const fromPodcastUrl = item.podcastUrl ? String(item.podcastUrl).split("/").filter(Boolean).at(-1) : "";
  return normalizeSlug(fromPodcastUrl || item.psdbSlug || item.slug || "");
}

function deriveUmbrellaSlug(umbrella) {
  if (!umbrella) return "";
  const fromUrl = umbrella.presentationUrl ? String(umbrella.presentationUrl).split("/").filter(Boolean).at(-1) : "";
  return normalizeSlug(fromUrl || umbrella.slug || "");
}

function normalizeSlug(value) {
  return String(value)
    .replace(/\.xml.*$/, "")
    .replace(/-\d+$/, "")
    .replace(/^sara-og-monopolet-podcast$/, "sara-og-monopolet")
    .replace(/^mads-monopolet-podcast$/, "sara-og-monopolet")
    .replace(/^hjernekassen-paa-p1$/, "hjernekassen")
    .replace(/^hjernekassen-pa-p1$/, "hjernekassen")
    .replace(/^moerklagt-agent-samsam$/, "moerklagt");
}

function uniqueByProductionNumber(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.productionNumber || item.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function slugFromFeedUrl(feedUrl) {
  const match = /\/feeds\/([^/?]+)(?:\.xml)?/i.exec(feedUrl || "");
  if (!match) throw new Error(`Kan ikke finde slug i feedUrl: ${feedUrl}`);
  return match[1];
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function formatRssDate(date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getUTCDay()]}, ${String(date.getUTCDate()).padStart(2, "0")} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")} +0000`;
}

function xml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function html(value = "") {
  return xml(value);
}

function css() {
  return `
:root {
  color-scheme: light;
  font-family: Arial, Helvetica, sans-serif;
  background: #f6f4ef;
  color: #17211f;
}

body { margin: 0; }

header, main {
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px 18px;
}

header { padding-top: 40px; }

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

.podcast img, .cover {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  background: #d8ded9;
}

.cover {
  display: grid;
  place-items: center;
  font-size: 54px;
  font-weight: 700;
}

.podcast strong {
  display: block;
  margin-top: 8px;
  line-height: 1.25;
}

.podcast small { color: #69736f; }
`.trimStart();
}
