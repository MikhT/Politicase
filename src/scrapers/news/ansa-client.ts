/**
 * ANSA politics RSS ingester.
 *
 * Fetches the public ANSA politics feed and returns raw news items.
 * Politician matching happens downstream (see matcher.ts) so the same
 * pipeline can serve other feeds later (Repubblica, Corriere, ...).
 */

export interface NewsItem {
  title: string;
  description: string;
  url: string;
  publishedAt: Date;
  sourceName: string;
}

const FEEDS = [
  {
    name: "ANSA",
    url: "https://www.ansa.it/sito/notizie/politica/politica_rss.xml",
  },
];

export class NewsClient {
  private timeoutMs: number;

  constructor(opts: { timeoutMs?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  /** Fetch all configured feeds; failures on one feed don't block others. */
  async fetchAll(): Promise<NewsItem[]> {
    const results = await Promise.allSettled(
      FEEDS.map((f) => this.fetchFeed(f.name, f.url)),
    );
    return results
      .filter(
        (r): r is PromiseFulfilledResult<NewsItem[]> =>
          r.status === "fulfilled",
      )
      .flatMap((r) => r.value);
  }

  async fetchFeed(sourceName: string, feedUrl: string): Promise<NewsItem[]> {
    const response = await fetch(feedUrl, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        "User-Agent": "Politicase/0.1 (open-data transparency project)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });
    if (!response.ok) {
      throw new Error(`${sourceName} feed returned HTTP ${response.status}`);
    }

    const xml = await response.text();
    return this.parseRss(xml, sourceName);
  }

  private parseRss(xml: string, sourceName: string): NewsItem[] {
    const items: NewsItem[] = [];
    const chunks = xml.split("<item>").slice(1);

    for (const chunk of chunks) {
      const title = extractTag(chunk, "title");
      const description = extractTag(chunk, "description");
      const link = extractTag(chunk, "link");
      const pubDate = extractTag(chunk, "pubDate");
      if (!title || !link) continue;

      items.push({
        title: decodeEntities(title),
        description: decodeEntities(description ?? ""),
        url: link.trim(),
        publishedAt: pubDate ? new Date(pubDate) : new Date(),
        sourceName,
      });
    }
    return items;
  }
}

function extractTag(xml: string, tag: string): string | null {
  const cdata = xml.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`),
  );
  if (cdata) return cdata[1].trim();
  const plain = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return plain ? plain[1].trim() : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}
