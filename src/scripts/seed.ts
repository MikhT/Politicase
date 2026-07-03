/**
 * Seed the database with all parliamentarians currently in office,
 * fetched live from dati.camera.it and dati.senato.it.
 *
 * Usage: npm run seed
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { CameraClient } from "../scrapers/parliament/camera-client";
import { SenatoClient } from "../scrapers/parliament/senato-client";
import { normalizeGroup } from "../scrapers/parliament/groups";
import type { ParliamentarianRecord } from "../scrapers/parliament/types";
import { slugify, titleCase } from "../lib/slug";

async function upsertParty(
  partyCache: Map<string, number>,
  groupName: string | null,
): Promise<number | null> {
  const canonical = normalizeGroup(groupName);
  if (!canonical) return null;

  const cached = partyCache.get(canonical.slug);
  if (cached) return cached;

  const [existing] = await db
    .select({ id: schema.parties.id })
    .from(schema.parties)
    .where(eq(schema.parties.slug, canonical.slug));

  if (existing) {
    partyCache.set(canonical.slug, existing.id);
    return existing.id;
  }

  const [inserted] = await db
    .insert(schema.parties)
    .values({
      slug: canonical.slug,
      name: canonical.name,
      shortName: canonical.shortName,
      color: canonical.color,
    })
    .returning({ id: schema.parties.id });

  partyCache.set(canonical.slug, inserted.id);
  return inserted.id;
}

async function upsertPoliticians(records: ParliamentarianRecord[]) {
  const partyCache = new Map<string, number>();
  let inserted = 0;
  let updated = 0;

  for (const rec of records) {
    if (!rec.firstName || !rec.lastName) continue;

    const firstName = titleCase(rec.firstName);
    const lastName = titleCase(rec.lastName);
    const partyId = await upsertParty(partyCache, rec.groupName);

    const values = {
      sourceUri: rec.sourceUri,
      firstName,
      lastName,
      chamber: rec.chamber,
      gender: rec.gender,
      birthDate: rec.birthDate,
      birthPlace: rec.birthPlace ? titleCase(rec.birthPlace) : null,
      photoUrl: rec.photoUrl,
      partyId,
      groupName: rec.groupName,
      updatedAt: new Date(),
    };

    const [existing] = await db
      .select({ id: schema.politicians.id })
      .from(schema.politicians)
      .where(eq(schema.politicians.sourceUri, rec.sourceUri));

    if (existing) {
      await db
        .update(schema.politicians)
        .set(values)
        .where(eq(schema.politicians.id, existing.id));
      updated++;
    } else {
      // Slug collisions (homonyms) get the chamber appended
      let slug = slugify(firstName, lastName);
      const [slugTaken] = await db
        .select({ id: schema.politicians.id })
        .from(schema.politicians)
        .where(eq(schema.politicians.slug, slug));
      if (slugTaken) slug = `${slug}-${rec.chamber}`;

      await db.insert(schema.politicians).values({ ...values, slug });
      inserted++;
    }
  }

  return { inserted, updated };
}

async function main() {
  console.log("== Politicase seed ==");

  console.log("Fetching senators from dati.senato.it ...");
  const senato = new SenatoClient();
  const senators = await senato.fetchSenators();
  console.log(`  ${senators.length} senators in office`);

  console.log("Fetching deputies from dati.camera.it (solving challenges) ...");
  const camera = new CameraClient();
  const deputies = await camera.fetchDeputies();
  console.log(`  ${deputies.length} deputies in office`);

  console.log("Upserting into database ...");
  const senatoStats = await upsertPoliticians(senators);
  const cameraStats = await upsertPoliticians(deputies);

  console.log(
    `Done. Senato: +${senatoStats.inserted}/~${senatoStats.updated}, ` +
      `Camera: +${cameraStats.inserted}/~${cameraStats.updated}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
