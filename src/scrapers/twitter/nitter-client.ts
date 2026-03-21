import type {
  NitterConfig,
  Tweet,
  ScraperResult,
  ScraperError,
} from "./types";

/**
 * Nitter RSS client — fetches tweets via public Nitter instance RSS feeds.
 *
 * Nitter exposes RSS feeds at /{handle}/rss which return standard XML.
 * No HTML parsing needed, no Cheerio, no Playwright — just fetch + XML parse.
 *
 * Multiple public instances are tried in order for resilience.
 * If one goes down, the next is tried automatically.
 */
export class NitterClient {
  private instanceUrls: string[];
  private timeoutMs: number;
  private delayMs: number;

  constructor(config: NitterConfig) {
    this.instanceUrls = config.instanceUrls.map((u) => u.replace(/\/$/, ""));
    this.timeoutMs = config.timeoutMs;
    this.delayMs = config.delayBetweenRequestsMs;
  }

  /**
   * Find the first healthy Nitter instance from the list.
   * Returns the base URL or null if none are reachable.
   */
  async findHealthyInstance(): Promise<string | null> {
    for (const url of this.instanceUrls) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(5_000),
        });
        if (response.ok) return url;
      } catch {
        // Try next instance
      }
    }
    return null;
  }

  /**
   * Fetch recent tweets for a handle via Nitter RSS.
   * Tries each configured instance in order until one works.
   *
   * @param handle - Twitter handle without '@' (e.g. "GiorgiaMeloni")
   * @param maxTweets - Maximum number of tweets to return
   */
  async fetchTweets(
    handle: string,
    maxTweets: number = 50,
  ): Promise<ScraperResult> {
    const cleanHandle = handle.replace(/^@/, "");
    let lastError: ScraperError | null = null;

    for (const baseUrl of this.instanceUrls) {
      try {
        return await this.fetchFromInstance(baseUrl, cleanHandle, maxTweets);
      } catch (err) {
        lastError = err as ScraperError;
        // Try next instance
      }
    }

    // All instances failed
    throw lastError ?? {
      source: "nitter" as const,
      handle: cleanHandle,
      message: "All Nitter instances failed",
      retryable: true,
    };
  }

  /**
   * Fetch RSS feed from a specific Nitter instance.
   */
  private async fetchFromInstance(
    baseUrl: string,
    handle: string,
    maxTweets: number,
  ): Promise<ScraperResult> {
    const rssUrl = `${baseUrl}/${handle}/rss`;

    const response = await fetch(rssUrl, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        "User-Agent": "Politicase/1.0 (parliamentary transparency project)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      const error: ScraperError = {
        source: "nitter",
        handle,
        message: `${baseUrl} returned HTTP ${response.status}`,
        statusCode: response.status,
        retryable: response.status >= 500 || response.status === 429,
      };
      throw error;
    }

    const xml = await response.text();
    const tweets = this.parseRssFeed(xml, handle);

    return {
      tweets: tweets.slice(0, maxTweets),
      handle,
      scrapedAt: new Date(),
      source: "nitter",
    };
  }

  /**
   * Parse Nitter RSS XML into Tweet objects.
   *
   * RSS structure:
   * <channel>
   *   <item>
   *     <title>Tweet text...</title>
   *     <dc:creator>@handle</dc:creator>
   *     <description><![CDATA[HTML content]]></description>
   *     <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
   *     <link>https://nitter.instance/handle/status/123456</link>
   *     <guid>https://nitter.instance/handle/status/123456</guid>
   *   </item>
   * </channel>
   */
  private parseRssFeed(xml: string, handle: string): Tweet[] {
    const tweets: Tweet[] = [];
    const items = xml.split("<item>").slice(1); // Skip channel header

    for (const item of items) {
      const title = this.extractTag(item, "title");
      const link = this.extractTag(item, "link");
      const pubDate = this.extractTag(item, "pubDate");
      const creator = this.extractTag(item, "dc:creator");
      const description = this.extractCdata(item, "description");

      if (!title && !description) continue;

      // Extract tweet ID from the link URL
      const tweetId = link?.match(/status\/(\d+)/)?.[1] || "";
      if (!tweetId) continue;

      // Get clean text: prefer title (plain text), fallback to stripped description
      const text = title || this.stripHtml(description || "");

      // Detect retweets: Nitter prefixes with "RT by @handle"
      const isRetweet = text.startsWith("RT by @") || text.startsWith("RT @");

      // Detect replies: Nitter prefixes with "R to @handle"
      const isReply = text.startsWith("R to @");

      tweets.push({
        id: tweetId,
        text: this.cleanTweetText(text),
        authorHandle: creator?.replace(/^@/, "") || handle,
        authorName: handle,
        publishedAt: pubDate ? new Date(pubDate) : new Date(),
        sourceUrl: `https://x.com/${handle}/status/${tweetId}`,
        source: "nitter",
        isRetweet,
        isReply,
        language: null, // Detected downstream in ENRICH pipeline
      });
    }

    return tweets;
  }

  /**
   * Extract text content of a simple XML tag.
   */
  private extractTag(xml: string, tag: string): string | null {
    // Handle CDATA content
    const cdataRegex = new RegExp(
      `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`,
    );
    const cdataMatch = xml.match(cdataRegex);
    if (cdataMatch) return cdataMatch[1].trim();

    // Handle regular text content
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract CDATA content from a tag.
   */
  private extractCdata(xml: string, tag: string): string | null {
    const regex = new RegExp(
      `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`,
    );
    const match = xml.match(regex);
    return match ? match[1].trim() : this.extractTag(xml, tag);
  }

  /**
   * Strip HTML tags from a string.
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Clean up tweet text: remove RT/reply prefixes for cleaner storage.
   */
  private cleanTweetText(text: string): string {
    return text
      .replace(/^RT by @\w+:\s*/, "")
      .replace(/^R to @\w+:\s*/, "")
      .trim();
  }

  /**
   * Polite delay between requests.
   */
  async delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }
}
