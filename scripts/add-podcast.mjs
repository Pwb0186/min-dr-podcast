import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(root, "podcasts.json");
const input = process.argv[2];
const titleArg = process.argv.slice(3).join(" ").trim();

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
  const response = await fetch(`https://api.dr.dk/podcasts/v1/feeds/${slug}.xml?format=podcast`);
  if (!response.ok) throw new Error(`Kunne ikke hente titel for ${slug}`);
  const xml = await response.text();
  return (
    /<title><!\[CDATA\[(.*?)\]\]><\/title>/s.exec(xml)?.[1] ||
    /<title>(.*?)<\/title>/s.exec(xml)?.[1] ||
    slug
  ).trim();
}
