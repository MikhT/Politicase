import type { TwitterScraperConfig } from "./types";

/**
 * Well-known public Nitter instances with RSS support.
 * Ordered by reliability. The scraper tries them in sequence.
 */
const DEFAULT_NITTER_INSTANCES = [
  "https://nitter.privacydev.net",
  "https://nitter.poast.org",
  "https://nitter.woodland.cafe",
  "https://nitter.1d4.us",
];

/**
 * Default configuration for the Twitter/X scraper.
 * Override via environment variables in production.
 */
export function loadTwitterScraperConfig(): TwitterScraperConfig {
  const customInstances = process.env.NITTER_INSTANCE_URLS;

  return {
    nitter: {
      instanceUrls: customInstances
        ? customInstances.split(",").map((u) => u.trim())
        : DEFAULT_NITTER_INSTANCES,
      timeoutMs: Number(process.env.NITTER_TIMEOUT_MS) || 10_000,
      delayBetweenRequestsMs:
        Number(process.env.NITTER_DELAY_MS) || 1_500,
    },
    apify: {
      apiToken: process.env.APIFY_API_TOKEN || "",
      actorId:
        process.env.APIFY_TWITTER_ACTOR_ID || "apidojo~tweet-scraper",
      timeoutMs: Number(process.env.APIFY_TIMEOUT_MS) || 60_000,
      maxCostPerRunUsd:
        Number(process.env.APIFY_MAX_COST_USD) || 0.5,
    },
    maxTweetsPerRun: Number(process.env.TWITTER_MAX_TWEETS) || 50,
    allowedLanguages: (process.env.TWITTER_LANGUAGES || "it").split(","),
    nitterRetryDelayMs:
      Number(process.env.NITTER_RETRY_DELAY_MS) || 2_000,
    nitterMaxRetries: Number(process.env.NITTER_MAX_RETRIES) || 3,
  };
}
