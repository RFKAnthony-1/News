// Pulls fresh headlines from Google News RSS (no API key needed) and writes data.json.
// Run manually with: node scripts/fetch-news.mjs
// Run daily by the GitHub Actions workflow at .github/workflows/update-news.yml

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "data.json");

const CATEGORIES = [
  { id: "closures", label: "Bank closures", live: true },
  { id: "rates", label: "Rate changes", live: false },
  { id: "mergers", label: "Mergers & M&A", live: false },
  { id: "fintech", label: "Fintech", live: false },
];

// Each tracked institution/category combo maps to one Google News RSS query,
// plus a relevance filter: every group in `mustMatch` needs at least one hit
// (case-insensitive substring) across the headline+summary, all groups required.
const TRACKED = [
  {
    category: "closures",
    inst: "guardian",
    instLabel: "Guardian Credit Union (AL)",
    color: "c-teal",
    query: "\"Guardian Credit Union\" Alabama",
    mustMatch: [["guardian"], ["credit union", "alabama", "branch", "shared branching"]],
  },
  {
    category: "closures",
    inst: "navyfederal",
    instLabel: "Navy Federal Credit Union",
    color: "c-blue",
    query: "\"Navy Federal Credit Union\" branch closing OR closure",
    mustMatch: [["navy federal"], ["branch", "clos", "shut"]],
  },
  {
    category: "closures",
    inst: "marcus",
    instLabel: "Marcus by Goldman Sachs",
    color: "c-coral",
    query: "Marcus Goldman Sachs savings closing OR shutting OR winding down",
    mustMatch: [["marcus", "goldman"], ["clos", "shut", "wind"]],
  },
  {
    category: "closures",
    inst: "industry",
    instLabel: "Industry-wide",
    color: "c-gray",
    query: "bank branch closures 2026",
    mustMatch: [["bank", "credit union"], ["branch", "clos", "shut"]],
  },
];

const RAW_LIMIT = 10;
const STORIES_PER_QUERY = 3;

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!m) return "";
  let val = m[1];
  const cdata = val.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cdata) val = cdata[1];
  return stripHtml(decodeEntities(val)).trim();
}

function extractSourceName(item) {
  const m = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);
  return m ? stripHtml(decodeEntities(m[1])).trim() : "";
}

function formatDate(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d)) return pubDate;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function matchesFilter(text, mustMatch) {
  const lower = text.toLowerCase();
  return mustMatch.every((group) => group.some((kw) => lower.includes(kw)));
}

async function fetchQuery(t) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(t.query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`RSS fetch failed (${res.status}) for query: ${t.query}`);
  const xml = await res.text();
  const items = xml.split("<item>").slice(1).map((chunk) => "<item>" + chunk.split("</item>")[0] + "</item>");

  const parsed = items.slice(0, RAW_LIMIT).map((item) => {
    const rawTitle = extractTag(item, "title");
    const link = extractTag(item, "link");
    const pubDate = extractTag(item, "pubDate");
    const sourceName = extractSourceName(item);
    const headline = sourceName && rawTitle.endsWith(` - ${sourceName}`)
      ? rawTitle.slice(0, -(sourceName.length + 3))
      : rawTitle.replace(/\s-\s[^-]+$/, "");
    return {
      headline,
      url: link,
      pubDate,
      date: formatDate(pubDate),
      source: sourceName || "Google News",
    };
  });

  return parsed
    .filter((p) => matchesFilter(p.headline, t.mustMatch))
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, STORIES_PER_QUERY)
    .map(({ pubDate, ...rest }) => rest);
}

async function main() {
  const stories = [];
  for (const t of TRACKED) {
    try {
      const results = await fetchQuery(t);
      for (const r of results) {
        stories.push({
          inst: t.inst,
          instLabel: t.instLabel,
          color: t.color,
          category: t.category,
          ...r,
        });
      }
      console.log(`${t.instLabel}: ${results.length} relevant stories`);
    } catch (err) {
      console.error(`Failed to fetch "${t.instLabel}":`, err.message);
    }
  }

  const data = {
    updatedAt: new Date().toISOString(),
    categories: CATEGORIES,
    stories,
  };

  await writeFile(OUT_PATH, JSON.stringify(data, null, 2));
  console.log(`Wrote ${stories.length} stories to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
