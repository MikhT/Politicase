/**
 * Types for the Twitter/X scraper module.
 * Supports Nitter RSS (primary) and Apify (fallback) as data sources.
 */

export interface Tweet {
  id: string;
  text: string;
  authorHandle: string;
  authorName: string;
  publishedAt: Date;
  sourceUrl: string;
  source: "nitter" | "apify";
  isRetweet: boolean;
  isReply: boolean;
  language: string | null;
}

export interface ScraperResult {
  tweets: Tweet[];
  handle: string;
  scrapedAt: Date;
  source: "nitter" | "apify";
}

export interface ScraperError {
  source: "nitter" | "apify";
  handle: string;
  message: string;
  statusCode?: number;
  retryable: boolean;
}

export interface TwitterScraperConfig {
  nitter: NitterConfig;
  apify: ApifyConfig;
  /** Max tweets per politician per scrape cycle */
  maxTweetsPerRun: number;
  /** Only collect tweets in these languages */
  allowedLanguages: string[];
  /** Retry delay in ms before falling back to Apify */
  nitterRetryDelayMs: number;
  /** Max Nitter retries (across all instances) before fallback */
  nitterMaxRetries: number;
}

export interface NitterConfig {
  /** List of public Nitter instance base URLs (tried in order) */
  instanceUrls: string[];
  /** Request timeout in ms */
  timeoutMs: number;
  /** Delay between requests to avoid rate limiting */
  delayBetweenRequestsMs: number;
}

export interface ApifyConfig {
  /** Apify API token */
  apiToken: string;
  /** Actor ID for the Twitter scraper */
  actorId: string;
  /** Request timeout in ms */
  timeoutMs: number;
  /** Max cost per run in USD (safety limit) */
  maxCostPerRunUsd: number;
}
