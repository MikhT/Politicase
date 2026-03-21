import { NitterClient } from "./nitter-client";
import { ApifyClient } from "./apify-client";
import { loadTwitterScraperConfig } from "./config";
import type {
  Tweet,
  ScraperResult,
  ScraperError,
  TwitterScraperConfig,
} from "./types";

export type { Tweet, ScraperResult, ScraperError, TwitterScraperConfig };

/**
 * TwitterScraper — unified scraper with automatic failover.
 *
 * Strategy:
 *   1. Try Nitter (free, self-hosted) with retries
 *   2. If Nitter fails, fall back to Apify (paid, cloud)
 *   3. Filter tweets by language (default: Italian only)
 *   4. Skip retweets (we want original declarations)
 *
 * Usage:
 *   const scraper = new TwitterScraper();
 *   const result = await scraper.scrape("GiorgiaMeloni");
 */
export class TwitterScraper {
  private nitter: NitterClient;
  private apify: ApifyClient;
  private config: TwitterScraperConfig;

  constructor(config?: TwitterScraperConfig) {
    this.config = config ?? loadTwitterScraperConfig();
    this.nitter = new NitterClient(this.config.nitter);
    this.apify = new ApifyClient(this.config.apify);
  }

  /**
   * Scrape tweets for a politician's Twitter handle.
   * Tries Nitter first, falls back to Apify on failure.
   *
   * @param handle - Twitter handle (with or without '@')
   * @returns Filtered tweets (Italian, no retweets)
   */
  async scrape(handle: string): Promise<ScraperResult> {
    const errors: ScraperError[] = [];

    // --- Attempt 1: Nitter ---
    const nitterResult = await this.tryNitter(handle, errors);
    if (nitterResult) {
      return this.filterTweets(nitterResult);
    }

    // --- Attempt 2: Apify fallback ---
    const apifyResult = await this.tryApify(handle, errors);
    if (apifyResult) {
      return this.filterTweets(apifyResult);
    }

    // Both sources failed
    console.error(
      `[TwitterScraper] All sources failed for @${handle}:`,
      errors,
    );

    return {
      tweets: [],
      handle: handle.replace(/^@/, ""),
      scrapedAt: new Date(),
      source: "nitter",
      hasMore: false,
      cursor: null,
    };
  }

  /**
   * Scrape multiple handles in sequence with polite delays.
   */
  async scrapeMultiple(handles: string[]): Promise<Map<string, ScraperResult>> {
    const results = new Map<string, ScraperResult>();

    for (const handle of handles) {
      const result = await this.scrape(handle);
      results.set(handle.replace(/^@/, ""), result);

      // Polite delay between politicians
      await this.nitter.delay();
    }

    return results;
  }

  /**
   * Check which data sources are currently available.
   */
  async checkHealth(): Promise<{
    nitter: boolean;
    apify: boolean;
  }> {
    const [nitterOk, apifyOk] = await Promise.all([
      this.nitter.isHealthy(),
      Promise.resolve(this.apify.isConfigured()),
    ]);

    return { nitter: nitterOk, apify: apifyOk };
  }

  // --- Private helpers ---

  private async tryNitter(
    handle: string,
    errors: ScraperError[],
  ): Promise<ScraperResult | null> {
    for (let attempt = 0; attempt <= this.config.nitterMaxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(
            `[TwitterScraper] Nitter retry ${attempt}/${this.config.nitterMaxRetries} for @${handle}`,
          );
          await sleep(this.config.nitterRetryDelayMs * attempt);
        }

        return await this.nitter.fetchTweets(
          handle,
          this.config.maxTweetsPerRun,
        );
      } catch (err) {
        const scraperErr = err as ScraperError;
        errors.push(scraperErr);
        console.warn(
          `[TwitterScraper] Nitter attempt ${attempt + 1} failed for @${handle}: ${scraperErr.message}`,
        );

        if (!scraperErr.retryable) break;
      }
    }

    console.log(
      `[TwitterScraper] Nitter exhausted, falling back to Apify for @${handle}`,
    );
    return null;
  }

  private async tryApify(
    handle: string,
    errors: ScraperError[],
  ): Promise<ScraperResult | null> {
    try {
      return await this.apify.fetchTweets(
        handle,
        this.config.maxTweetsPerRun,
      );
    } catch (err) {
      const scraperErr = err as ScraperError;
      errors.push(scraperErr);
      console.warn(
        `[TwitterScraper] Apify failed for @${handle}: ${scraperErr.message}`,
      );
      return null;
    }
  }

  /**
   * Filter tweets: keep only Italian originals (no retweets).
   */
  private filterTweets(result: ScraperResult): ScraperResult {
    const filtered = result.tweets.filter((tweet) => {
      // Skip retweets — we want original declarations
      if (tweet.isRetweet) return false;

      // Language filter (null = unknown, keep it for later detection)
      if (
        tweet.language !== null &&
        !this.config.allowedLanguages.includes(tweet.language)
      ) {
        return false;
      }

      // Skip empty tweets
      if (!tweet.text.trim()) return false;

      return true;
    });

    return { ...result, tweets: filtered };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
