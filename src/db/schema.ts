import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Parliamentary groups / parties.
 * A "gruppo parlamentare" maps closely (not perfectly) to a party.
 */
export const parties = pgTable(
  "parties",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    color: text("color"),
    coalition: text("coalition"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("parties_slug_idx").on(t.slug)],
);

/**
 * Members of parliament (Camera + Senato, current legislature).
 */
export const politicians = pgTable(
  "politicians",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    /** Stable ID from the source dataset (Camera/Senato URI) */
    sourceUri: text("source_uri").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    chamber: text("chamber", { enum: ["camera", "senato"] }).notNull(),
    gender: text("gender"),
    birthDate: text("birth_date"),
    birthPlace: text("birth_place"),
    photoUrl: text("photo_url"),
    partyId: integer("party_id").references(() => parties.id),
    /** Raw group name as reported by the source */
    groupName: text("group_name"),
    socialTwitter: text("social_twitter"),
    socialFacebook: text("social_facebook"),
    socialInstagram: text("social_instagram"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("politicians_slug_idx").on(t.slug),
    uniqueIndex("politicians_source_uri_idx").on(t.sourceUri),
    index("politicians_chamber_idx").on(t.chamber),
    index("politicians_party_idx").on(t.partyId),
    index("politicians_last_name_idx").on(t.lastName),
  ],
);

/**
 * Public statements: news mentions, social posts, parliamentary speeches.
 */
export const statements = pgTable(
  "statements",
  {
    id: serial("id").primaryKey(),
    politicianId: integer("politician_id")
      .notNull()
      .references(() => politicians.id),
    sourceType: text("source_type", {
      enum: ["news", "social", "parliament", "interview"],
    }).notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title"),
    originalText: text("original_text").notNull(),
    topics: jsonb("topics").$type<string[]>(),
    sentiment: real("sentiment"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One statement per politician per source URL (dedup)
    uniqueIndex("statements_politician_url_idx").on(
      t.politicianId,
      t.sourceUrl,
    ),
    index("statements_politician_idx").on(t.politicianId),
    index("statements_published_idx").on(t.publishedAt),
    index("statements_source_type_idx").on(t.sourceType),
  ],
);

/**
 * AI-computed coherence scores (Phase 2).
 * One row per politician per score type per computation run.
 */
export const coherenceScores = pgTable(
  "coherence_scores",
  {
    id: serial("id").primaryKey(),
    politicianId: integer("politician_id")
      .notNull()
      .references(() => politicians.id),
    scoreType: text("score_type", {
      enum: ["party_alignment", "self_consistency", "vote_statement"],
    }).notNull(),
    /** 0..1 */
    score: real("score").notNull(),
    /** Free-form explanation produced by the model */
    explanation: text("explanation"),
    /** Number of statements/votes the score is based on */
    sampleSize: integer("sample_size"),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("coherence_politician_idx").on(t.politicianId),
    index("coherence_type_idx").on(t.scoreType),
  ],
);
