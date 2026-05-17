import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(root, "podcasts.json");
const input = process.argv[2];
const titleArg = process.argv.slice(3).join(" ").trim();
const DR_API_KEY = process.env.DR_API_KEY || "6Wkh8s98Afx1ZAaTT4FuWODTmvWGDPpR";

if (!input) {
  console.error("Brug: npm run add -- genstart");
  console.error("eller: npm run add -- https://www.dr.dk/lyd/special-radio/genstart-2642056922000");
  process.exit(1);
}

const config = JSON.parse(await readFile(configPath, "utf8"));
config.podcasts ||= [];

const slug = extractSlug(input);
if (config.podcasts.some((podcast) => podcast.slug === slug)) {
  console.log(`${slug} findes allerede i podcasts.json.`);
  process.exit(0);
}

let title = titleArg;
if (!title) {
  title = await fetchTitle(slug).catch(() => slug);
}

config.podcasts.push({ slug, title });
config.podcasts.sort((a, b) => (a.title || a.slug).localeCompare(b.title || b.slug, "da"));

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Tilføjede ${title} (${slug}) til podcasts.json.`);

function extractSlug(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("http")) return trimmed.replace(/\.xml.*$/, "");

  const url = new URL(trimmed);
  const lastPart = url.pathname.split("/").filter(Boolean).at(-1) || "";
  const feedMatch = /\/feeds\/([^/]+)\.xml/i.exec(url.pathname);
  if (feedMatch) return feedMatch[1];

  const pageMatch = /^(.+)-\d+$/.exec(lastPart);
  if (pageMatch) return pageMatch[1];

  return lastPart;
}

async function fetchTitle(slug) {
  const response = await fetch("https://api.dr.dk/radio/v2/series?limit=10000", {
    headers: {
      "accept": "application/json",
      "referer": "https://www.dr.dk/",
      "user-agent": "privat-dr-podcast-manager/2.0",
      "x-apikey": DR_API_KEY
    }
  });
  if (!response.ok) throw new Error(`Kunne ikke hente titel for ${slug}`);
  const data = await response.json();
  const show = (data.items || []).find((item) => deriveSlug(item) === slug);
  return show?.title || slug;
}

function deriveSlug(item) {
  const fromPodcastUrl = item.podcastUrl ? String(item.podcastUrl).split("/").filter(Boolean).at(-1) : "";
  return String(fromPodcastUrl || item.psdbSlug || item.slug || "")
    .replace(/\.xml.*$/, "")
    .replace(/-\d+$/, "")
    .replace(/^sara-og-monopolet-podcast$/, "sara-og-monopolet")
    .replace(/^mads-monopolet-podcast$/, "sara-og-monopolet")
    .replace(/^hjernekassen-paa-p1$/, "hjernekassen")
    .replace(/^hjernekassen-pa-p1$/, "hjernekassen")
    .replace(/^moerklagt-agent-samsam$/, "moerklagt");
}
