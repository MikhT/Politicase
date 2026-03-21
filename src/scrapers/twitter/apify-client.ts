import type {
  ApifyConfig,
  Tweet,
  ScraperResult,
  ScraperError,
} from "./types";

/**
 * Apify client — uses the Apify platform to scrape tweets via managed actors.
 *
 * Used as fallback when all public Nitter instances are down.
 * Pay-per-use pricing (~$0.25-0.50 per actor run for 50 tweets).
 *
 * Setup:
 *   1. Create account at https://apify.com
 *   2. Get API token from Settings > Integrations
 *   3. Set APIFY_API_TOKEN env variable
 */

const APIFY_API_BASE = "https://api.apify.com/v2";

/** Shape of a tweet as returned by the Apify Twitter scraper actor */
interface ApifyTweetItem {
  id_str?: string;
  id?: string;
  full_text?: string;
  text?: string;
  user?: {
    screen_name?: string;
    name?: string;
  };
  created_at?: string;
  retweeted_status?: unknown;
  in_reply_to_status_id_str?: string | null;
  lang?: string;
}

export class ApifyClient {
  private apiToken: string;
  private actorId: string;
  private timeoutMs: number;

  constructor(config: ApifyConfig) {
    this.apiToken = config.apiToken;
    this.actorId = config.actorId;
    this.timeoutMs = config.timeoutMs;
  }

  /**
   * Check if the Apify client is properly configured.
   */
  isConfigured(): boolean {
    return this.apiToken.length > 0;
  }

  /**
   * Fetch tweets for a handle using the Apify Twitter scraper actor.
   * Triggers an actor run and waits for results synchronously.
   */
  async fetchTweets(
    handle: string,
    maxTweets: number = 50,
  ): Promise<ScraperResult> {
    const cleanHandle = handle.replace(/^@/, "");

    if (!this.isConfigured()) {
      const error: ScraperError = {
        source: "apify",
        handle: cleanHandle,
        message: "Apify API token not configured (set APIFY_API_TOKEN)",
        retryable: false,
      };
      throw error;
    }

    const runUrl =
      `${APIFY_API_BASE}/acts/${this.actorId}/run-sync-get-dataset-items` +
      `?token=${this.apiToken}`;

    const response = await fetch(runUrl, {
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchTerms: [`from:${cleanHandle}`],
        maxTweets,
        maxRequestRetries: 2,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error: ScraperError = {
        source: "apify",
        handle: cleanHandle,
        message: `Apify returned HTTP ${response.status}: ${body.slice(0, 200)}`,
        statusCode: response.status,
        retryable: response.status >= 500 || response.status === 429,
      };
      throw error;
    }

    const items: ApifyTweetItem[] = await response.json();
    const tweets = items
      .map((item) => this.mapToTweet(item, cleanHandle))
      .filter((t): t is Tweet => t !== null);

    return {
      tweets,
      handle: cleanHandle,
      scrapedAt: new Date(),
      source: "apify",
    };
  }

  /**
   * Map an Apify result item to our standard Tweet type.
   */
  private mapToTweet(item: ApifyTweetItem, handle: string): Tweet | null {
    const id = item.id_str || item.id?.toString();
    const text = item.full_text || item.text;
    if (!id || !text) return null;

    return {
      id,
      text,
      authorHandle: item.user?.screen_name || handle,
      authorName: item.user?.name || handle,
      publishedAt: item.created_at ? new Date(item.created_at) : new Date(),
      sourceUrl: `https://x.com/${handle}/status/${id}`,
      source: "apify",
      isRetweet: item.retweeted_status != null,
      isReply: item.in_reply_to_status_id_str != null,
      language: item.lang ?? null,
    };
  }
}
