import type {
  ApifyConfig,
  Tweet,
  TweetMetrics,
  ScraperResult,
  ScraperError,
} from "./types";

/**
 * Apify client — uses the Apify platform to scrape tweets via managed actors.
 *
 * Used as fallback when the Nitter instance is down or blocked.
 * Pay-per-use pricing (~$0.25-0.50 per actor run for 50 tweets).
 *
 * Setup:
 *   1. Create account at https://apify.com
 *   2. Get API token from Settings → Integrations
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
  favorite_count?: number;
  retweet_count?: number;
  reply_count?: number;
  retweeted_status?: unknown;
  in_reply_to_status_id_str?: string | null;
  lang?: string;
  entities?: {
    media?: Array<{ type?: string; media_url_https?: string }>;
  };
}

export class ApifyClient {
  private apiToken: string;
  private actorId: string;
  private timeoutMs: number;
  private maxCostUsd: number;

  constructor(config: ApifyConfig) {
    this.apiToken = config.apiToken;
    this.actorId = config.actorId;
    this.timeoutMs = config.timeoutMs;
    this.maxCostUsd = config.maxCostPerRunUsd;
  }

  /**
   * Check if the Apify client is properly configured.
   */
  isConfigured(): boolean {
    return this.apiToken.length > 0;
  }

  /**
   * Fetch tweets for a handle using the Apify Twitter scraper actor.
   * This triggers an actor run and waits for results synchronously.
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

    // Run the actor synchronously (waits for completion)
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
        // Safety: limit cost
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
      hasMore: false, // Apify returns all results in one batch
      cursor: null,
    };
  }

  /**
   * Get estimated cost for the current billing period.
   * Useful for monitoring the budget safety limit.
   */
  async getMonthlyUsage(): Promise<{ totalUsd: number }> {
    const url = `${APIFY_API_BASE}/users/me/usage?token=${this.apiToken}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { totalUsd: 0 };
    }

    const data = await response.json();
    return {
      totalUsd: data?.monthlyUsage?.totalUsd ?? 0,
    };
  }

  /**
   * Map an Apify result item to our standard Tweet type.
   */
  private mapToTweet(
    item: ApifyTweetItem,
    handle: string,
  ): Tweet | null {
    const id = item.id_str || item.id?.toString();
    const text = item.full_text || item.text;
    if (!id || !text) return null;

    const metrics: TweetMetrics = {
      likes: item.favorite_count ?? 0,
      retweets: item.retweet_count ?? 0,
      replies: item.reply_count ?? 0,
    };

    const media =
      item.entities?.media?.map((m) => ({
        type: (m.type === "video" ? "video" : "image") as
          | "image"
          | "video"
          | "gif",
        url: m.media_url_https || "",
      })) ?? [];

    return {
      id,
      text,
      authorHandle: item.user?.screen_name || handle,
      authorName: item.user?.name || handle,
      publishedAt: item.created_at
        ? new Date(item.created_at)
        : new Date(),
      sourceUrl: `https://x.com/${handle}/status/${id}`,
      source: "apify",
      metrics,
      media,
      isRetweet: item.retweeted_status != null,
      isReply: item.in_reply_to_status_id_str != null,
      language: item.lang ?? null,
    };
  }
}
