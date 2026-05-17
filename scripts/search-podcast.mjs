const query = process.argv.slice(2).join(" ").trim().toLowerCase();
const DR_API_KEY = process.env.DR_API_KEY || "6Wkh8s98Afx1ZAaTT4FuWODTmvWGDPpR";

if (!query) {
  console.error("Brug: npm run search -- stjerner");
  console.error("eller: npm run search -- \"p6 elsker\"");
  process.exit(1);
}

const response = await fetch("https://api.dr.dk/radio/v2/series?limit=10000", {
  headers: {
    "accept": "application/json",
    "referer": "https://www.dr.dk/",
    "user-agent": "privat-dr-podcast-manager/2.0",
    "x-apikey": DR_API_KEY
  }
});

if (!response.ok) {
  throw new Error(`DR API svarede ${response.status}`);
}

const data = await response.json();
const matches = (data.items || [])
  .filter((item) => item.type === "Series")
  .map((item) => {
    const podcastSlug = deriveSlug(item);
    const pageSlug = derivePresentationSlug(item);
    const haystack = [
      item.title,
      item.slug,
      item.psdbSlug,
      podcastSlug,
      pageSlug,
      item.podcastUrl,
      item.presentationUrl
    ].join(" ").toLowerCase();

    return { item, podcastSlug, pageSlug, haystack };
  })
  .filter((entry) => entry.haystack.includes(query))
  .sort((a, b) => score(b, query) - score(a, query))
  .slice(0, 15);

if (!matches.length) {
  console.log(`Ingen resultater for "${query}".`);
  process.exit(0);
}

for (const [index, match] of matches.entries()) {
  const { item, podcastSlug, pageSlug } = match;
  const recommendedSlug = pageSlug || podcastSlug;

  console.log(`\n${index + 1}. ${item.title}`);
  console.log(`   Anbefalet slug: ${recommendedSlug}`);
  if (podcastSlug && podcastSlug !== recommendedSlug) {
    console.log(`   Podcast-slug:   ${podcastSlug}`);
  }
  console.log(`   DR-link:        ${item.presentationUrl || ""}`);
  console.log(`   URN:            ${item.id}`);
  console.log("   Kopier til podcasts.json:");
  console.log(JSON.stringify({
    slug: recommendedSlug,
    urn: item.id,
    title: item.title
  }, null, 2).split("\n").map((line) => `   ${line}`).join("\n"));
}

function score(entry, query) {
  const title = String(entry.item.title || "").toLowerCase();
  if (title === query) return 100;
  if (title.startsWith(query)) return 80;
  if (entry.pageSlug === query || entry.podcastSlug === query) return 70;
  return 10;
}

function deriveSlug(item) {
  const fromPodcastUrl = item.podcastUrl ? String(item.podcastUrl).split("/").filter(Boolean).at(-1) : "";
  return normalizeSlug(fromPodcastUrl || item.psdbSlug || item.slug || "");
}

function derivePresentationSlug(item) {
  const fromPresentationUrl = item.presentationUrl ? String(item.presentationUrl).split("/").filter(Boolean).at(-1) : "";
  return normalizeSlug(fromPresentationUrl || item.slug || "");
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
