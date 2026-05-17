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
