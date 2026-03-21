import * as cheerio from "cheerio";
import type {
  NitterConfig,
  Tweet,
  TweetMedia,
  TweetMetrics,
  ScraperResult,
  ScraperError,
} from "./types";

/**
 * Nitter client — scrapes tweets from a self-hosted Nitter instance.
 *
 * Nitter renders Twitter profiles as plain HTML, so we can parse them
 * with Cheerio without needing Playwright or any JS rendering.
 *
 * Setup: deploy Nitter via Docker (see docker-compose.yml)
 *   docker run -p 8080:8080 zedeus/nitter
 */
export class NitterClient {
  private baseUrl: string;
  private timeoutMs: number;
  private delayMs: number;

  constructor(config: NitterConfig) {
    this.baseUrl = config.instanceUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs;
    this.delayMs = config.delayBetweenRequestsMs;
  }

  /**
   * Check if the Nitter instance is healthy and reachable.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, {
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch recent tweets for a given Twitter handle.
   *
   * @param handle - Twitter handle without '@' (e.g. "GiorgiaMeloni")
   * @param maxTweets - Maximum number of tweets to collect
   * @param cursor - Pagination cursor from a previous ScraperResult
   */
  async fetchTweets(
    handle: string,
    maxTweets: number = 50,
    cursor?: string,
  ): Promise<ScraperResult> {
    const cleanHandle = handle.replace(/^@/, "");
    const url = cursor
      ? `${this.baseUrl}/${cleanHandle}?cursor=${encodeURIComponent(cursor)}`
      : `${this.baseUrl}/${cleanHandle}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        "User-Agent": "Politicase/1.0 (parliamentary transparency project)",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      const error: ScraperError = {
        source: "nitter",
        handle: cleanHandle,
        message: `Nitter returned HTTP ${response.status}`,
        statusCode: response.status,
        retryable: response.status >= 500 || response.status === 429,
      };
      throw error;
    }

    const html = await response.text();
    const tweets = this.parseTimeline(html, cleanHandle);

    // Respect maxTweets limit
    const limited = tweets.slice(0, maxTweets);

    // Extract pagination cursor for next page
    const nextCursor = this.extractCursor(html);

    return {
      tweets: limited,
      handle: cleanHandle,
      scrapedAt: new Date(),
      source: "nitter",
      hasMore: nextCursor !== null && tweets.length >= 20,
      cursor: nextCursor,
    };
  }

  /**
   * Parse the Nitter HTML timeline into structured Tweet objects.
   */
  private parseTimeline(html: string, handle: string): Tweet[] {
    const $ = cheerio.load(html);
    const tweets: Tweet[] = [];

    $(".timeline-item").each((_i, el) => {
      const $item = $(el);

      // Skip pinned tweets
      if ($item.find(".pinned").length > 0) return;

      const tweetLink = $item.find(".tweet-link").attr("href") || "";
      const tweetId = tweetLink.split("/").pop()?.replace("#m", "") || "";
      if (!tweetId) return;

      const text = $item.find(".tweet-content").text().trim();
      const authorName =
        $item.find(".fullname").first().text().trim() || handle;
      const dateStr = $item.find(".tweet-date a").attr("title") || "";

      const isRetweet = $item.find(".retweet-header").length > 0;
      const isReply = $item.find(".replying-to").length > 0;

      const metrics = this.parseMetrics($, $item);
      const media = this.parseMedia($, $item);

      tweets.push({
        id: tweetId,
        text,
        authorHandle: handle,
        authorName,
        publishedAt: dateStr ? new Date(dateStr) : new Date(),
        sourceUrl: `https://x.com/${handle}/status/${tweetId}`,
        source: "nitter",
        metrics,
        media,
        isRetweet,
        isReply,
        language: null, // Detected later in the pipeline
      });
    });

    return tweets;
  }

  /**
   * Parse engagement metrics from a tweet element.
   */
  private parseMetrics(
    $: cheerio.CheerioAPI,
    $item: cheerio.Cheerio<cheerio.Element>,
  ): TweetMetrics {
    const parseCount = (selector: string): number => {
      const text = $item.find(selector).text().trim();
      if (!text) return 0;
      // Nitter shows counts like "1,234" or "12K"
      const cleaned = text.replace(/,/g, "");
      if (cleaned.endsWith("K")) return Math.round(parseFloat(cleaned) * 1_000);
      if (cleaned.endsWith("M"))
        return Math.round(parseFloat(cleaned) * 1_000_000);
      return parseInt(cleaned, 10) || 0;
    };

    return {
      likes: parseCount(".icon-heart + span"),
      retweets: parseCount(".icon-retweet + span"),
      replies: parseCount(".icon-comment + span"),
    };
  }

  /**
   * Parse media attachments from a tweet element.
   */
  private parseMedia(
    $: cheerio.CheerioAPI,
    $item: cheerio.Cheerio<cheerio.Element>,
  ): TweetMedia[] {
    const media: TweetMedia[] = [];

    $item.find(".attachment.image img").each((_i, img) => {
      const src = $(img).attr("src");
      if (src) {
        media.push({
          type: "image",
          url: src.startsWith("http") ? src : `${this.baseUrl}${src}`,
        });
      }
    });

    $item.find(".attachment.video").each(() => {
      media.push({ type: "video", url: "" });
    });

    return media;
  }

  /**
   * Extract the "show more" cursor for pagination.
   */
  private extractCursor(html: string): string | null {
    const $ = cheerio.load(html);
    const showMore = $(".show-more a").last().attr("href");
    if (!showMore) return null;

    const match = showMore.match(/cursor=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Polite delay between requests.
   */
  async delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }
}
