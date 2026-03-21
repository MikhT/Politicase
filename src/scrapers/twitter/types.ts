/**
 * Types for the Twitter/X scraper module.
 * Supports Nitter (primary) and Apify (fallback) as data sources.
 */

export interface Tweet {
  id: string;
  text: string;
  authorHandle: string;
  authorName: string;
  publishedAt: Date;
  sourceUrl: string;
  source: "nitter" | "apify";
  metrics: TweetMetrics;
  media: TweetMedia[];
  isRetweet: boolean;
  isReply: boolean;
  language: string | null;
}

export interface TweetMetrics {
  likes: number;
  retweets: number;
  replies: number;
}

export interface TweetMedia {
  type: "image" | "video" | "gif";
  url: string;
}

export interface ScraperResult {
  tweets: Tweet[];
  handle: string;
  scrapedAt: Date;
  source: "nitter" | "apify";
  hasMore: boolean;
  cursor: string | null;
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
  /** Max Nitter retries before fallback */
  nitterMaxRetries: number;
}

export interface NitterConfig {
  /** Self-hosted Nitter instance base URL */
  instanceUrl: string;
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
