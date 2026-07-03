/**
 * Ingest political news from RSS feeds and attach them as statements
 * to the politicians mentioned.
 *
 * Usage: npm run ingest:news
 */
import { db, schema } from "../db";
import { NewsClient } from "../scrapers/news/ansa-client";
import { PoliticianMatcher } from "../scrapers/news/matcher";

async function main() {
  console.log("== Politicase news ingestion ==");

  const politicians = await db
    .select({
      id: schema.politicians.id,
      firstName: schema.politicians.firstName,
      lastName: schema.politicians.lastName,
    })
    .from(schema.politicians);

  if (politicians.length === 0) {
    console.error("No politicians in DB — run `npm run seed` first.");
    process.exit(1);
  }

  const matcher = new PoliticianMatcher(politicians);
  const client = new NewsClient();

  console.log("Fetching news feeds ...");
  const items = await client.fetchAll();
  console.log(`  ${items.length} news items fetched`);

  let attached = 0;
  for (const item of items) {
    const text = `${item.title}. ${item.description}`;
    const matches = matcher.match(text);

    for (const { politicianId } of matches) {
      const result = await db
        .insert(schema.statements)
        .values({
          politicianId,
          sourceType: "news",
          sourceName: item.sourceName,
          sourceUrl: item.url,
          title: item.title,
          originalText: text,
          publishedAt: item.publishedAt,
        })
        .onConflictDoNothing()
        .returning({ id: schema.statements.id });
      if (result.length > 0) attached++;
    }
  }

  console.log(`Done. ${attached} new statements attached.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("News ingestion failed:", err);
  process.exit(1);
});
